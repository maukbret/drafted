import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_MAX_CAMPAIGNS = 20
const ABSOLUTE_MAX_CAMPAIGNS = 50
/** Stop paging once every wanted Klaviyo id has a status (recent-first sort helps). */
const MAX_CAMPAIGN_LIST_PAGES = 200
const EMAIL_NON_ARCHIVED_FILTER = encodeURIComponent(
  "and(equals(messages.channel,'email'),equals(archived,false))"
)
const TERMINAL_STATUSES: ReadonlySet<LocalCampaignStatus> = new Set(['sent', 'cancelled'])

type LocalCampaignStatus = 'in_progress' | 'klaviyo_draft' | 'scheduled' | 'cancelled' | 'sent' | 'error'

type SyncCampaign = {
  id: string
  klaviyo_campaign_id: string | null
  klaviyo_connection_id: string
  status: LocalCampaignStatus
  scheduled_at: string | null
  last_status_synced_at: string | null
}

function mapKlaviyoStatus(klaviyoStatus: unknown, fallbackStatus: LocalCampaignStatus): LocalCampaignStatus {
  if (typeof klaviyoStatus !== 'string') return fallbackStatus

  const normalized = klaviyoStatus.trim().toLowerCase()
  if (!normalized) return fallbackStatus

  if (normalized.includes('sent')) return 'sent'
  if (normalized.includes('schedule')) return 'scheduled'
  if (normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('draft')) return 'klaviyo_draft'
  if (normalized.includes('review') || normalized.includes('queued')) return 'klaviyo_draft'

  return fallbackStatus
}

function getSyncCooldownMs(campaign: SyncCampaign, nowMs: number): number {
  if (campaign.status === 'scheduled') {
    if (!campaign.scheduled_at) return 15 * 60 * 1000

    const scheduledMs = new Date(campaign.scheduled_at).getTime()
    if (Number.isNaN(scheduledMs)) return 15 * 60 * 1000

    const deltaMs = scheduledMs - nowMs
    if (deltaMs <= 0) return 5 * 60 * 1000
    if (deltaMs <= 2 * 60 * 60 * 1000) return 5 * 60 * 1000
    if (deltaMs <= 24 * 60 * 60 * 1000) return 30 * 60 * 1000
    return 2 * 60 * 60 * 1000
  }

  if (campaign.status === 'sent' || campaign.status === 'cancelled') return 24 * 60 * 60 * 1000
  if (campaign.status === 'error') return 30 * 60 * 1000
  if (campaign.status === 'in_progress') return 6 * 60 * 60 * 1000
  return 2 * 60 * 60 * 1000
}

function getPriorityScore(campaign: SyncCampaign, nowMs: number): number {
  if (campaign.status === 'scheduled') {
    if (!campaign.scheduled_at) return 80

    const scheduledMs = new Date(campaign.scheduled_at).getTime()
    if (Number.isNaN(scheduledMs)) return 80

    const deltaMs = scheduledMs - nowMs
    if (deltaMs <= 0) return 100
    if (deltaMs <= 2 * 60 * 60 * 1000) return 95
    if (deltaMs <= 24 * 60 * 60 * 1000) return 85
    return 70
  }

  if (campaign.status === 'klaviyo_draft') return 60
  if (campaign.status === 'in_progress') return 40
  if (campaign.status === 'error') return 30
  return 10
}

function getStaleMs(lastSyncedAt: string | null, nowMs: number): number {
  if (!lastSyncedAt) return Number.MAX_SAFE_INTEGER

  const syncedAtMs = new Date(lastSyncedAt).getTime()
  if (Number.isNaN(syncedAtMs)) return Number.MAX_SAFE_INTEGER
  return Math.max(0, nowMs - syncedAtMs)
}

/**
 * Paginated campaign list: one scan of Klaviyo per connection instead of N GET-by-id calls.
 * IDs not returned (e.g. archived, filtered) are left out — caller may fall back to GET.
 */
async function fetchKlaviyoStatusesFromList(
  token: string,
  wantedIds: ReadonlySet<string>
): Promise<Map<string, string>> {
  const byId = new Map<string, string>()
  if (wantedIds.size === 0) return byId

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    revision: '2026-01-15',
  } as const

  let nextUrl: string | null =
    `https://a.klaviyo.com/api/campaigns?filter=${EMAIL_NON_ARCHIVED_FILTER}&sort=-updated_at`
  let pageCount = 0

  const allFound = () => [...wantedIds].every((id) => byId.has(id))

  while (nextUrl && pageCount < MAX_CAMPAIGN_LIST_PAGES) {
    const response = await fetch(nextUrl, { headers })
    if (!response.ok) {
      console.error('Klaviyo campaigns list error:', response.status, await response.text().catch(() => ''))
      return byId
    }

    const data = (await response.json()) as {
      data?: Array<{ id?: string; attributes?: { status?: string } }>
      links?: { next?: string | null }
    }

    for (const item of data.data || []) {
      const id = item?.id
      if (typeof id !== 'string' || !wantedIds.has(id)) continue
      const status = item.attributes?.status
      if (typeof status === 'string') byId.set(id, status)
    }

    if (allFound()) break

    nextUrl = data.links?.next ?? null
    pageCount += 1
  }

  if (pageCount >= MAX_CAMPAIGN_LIST_PAGES && !allFound()) {
    console.warn('Klaviyo campaign list: max pages reached before all Drafted ids were found')
  }

  return byId
}

async function fetchKlaviyoStatusById(
  token: string,
  klaviyoCampaignId: string
): Promise<string | null> {
  const response = await fetch(`https://a.klaviyo.com/api/campaigns/${klaviyoCampaignId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      revision: '2026-01-15',
    },
  })
  if (!response.ok) return null
  const data = (await response.json()) as { data?: { attributes?: { status?: string } } }
  const status = data?.data?.attributes?.status
  return typeof status === 'string' ? status : null
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  if (items.length === 0) return

  let index = 0
  const runWorker = async () => {
    while (index < items.length) {
      const item = items[index]
      index++
      await worker(item)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's team membership
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single()

    // Get user's own Klaviyo connections
    const { data: ownConnections } = await supabase
      .from('klaviyo_connections')
      .select('id')
      .eq('user_id', user.id)

    const ownConnectionIds = ownConnections?.map(c => c.id) || []

    // Get team admin's connections if user is in a team
    let teamConnectionIds: string[] = []
    if (teamMembership) {
      const { data: adminMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .eq('role', 'admin')

      if (adminMembers && adminMembers.length > 0) {
        const { data: teamConnections } = await supabase
          .from('klaviyo_connections')
          .select('id')
          .in('user_id', adminMembers.map(m => m.user_id))

        teamConnectionIds = teamConnections?.map(c => c.id) || []
      }
    }

    const accessibleConnectionIds = [...new Set([...ownConnectionIds, ...teamConnectionIds])]

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await request.json().catch(() => ({})) as { mode?: unknown; maxCampaigns?: unknown }
    const mode = body.mode === 'manual' ? 'manual' : 'auto'
    const requestedMax = Number(body.maxCampaigns)
    const maxCampaigns = Number.isFinite(requestedMax) && requestedMax > 0
      ? Math.min(Math.floor(requestedMax), ABSOLUTE_MAX_CAMPAIGNS)
      : DEFAULT_MAX_CAMPAIGNS

    // Fetch all campaigns that have been exported to Klaviyo.
    // Sync filtering is done in-memory to support dynamic cadence logic.
    const { data: campaigns, error: campaignsError } = accessibleConnectionIds.length > 0
      ? await supabaseAdmin
          .from('campaigns')
          .select('id, klaviyo_campaign_id, klaviyo_connection_id, status, scheduled_at, last_status_synced_at')
          .in('klaviyo_connection_id', accessibleConnectionIds)
          .not('klaviyo_campaign_id', 'is', null)
      : { data: [], error: null }

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    const campaignsList = (campaigns || []) as SyncCampaign[]
    if (campaignsList.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No campaigns to sync' })
    }

    const syncEligible = campaignsList.filter((campaign) => !TERMINAL_STATUSES.has(campaign.status))
    if (syncEligible.length === 0) {
      return NextResponse.json({
        updated: 0,
        checked: 0,
        total: campaignsList.length,
        considered: 0,
        skipped: campaignsList.length,
        message: 'No sync-eligible campaigns',
      })
    }

    const nowMs = Date.now()
    const syncCandidates = mode === 'manual'
      ? [...syncEligible]
      : syncEligible
          .filter((campaign) => {
            const cooldown = getSyncCooldownMs(campaign, nowMs)
            return getStaleMs(campaign.last_status_synced_at, nowMs) >= cooldown
          })
          .sort((a, b) => {
            const priorityDiff = getPriorityScore(b, nowMs) - getPriorityScore(a, nowMs)
            if (priorityDiff !== 0) return priorityDiff
            return getStaleMs(b.last_status_synced_at, nowMs) - getStaleMs(a.last_status_synced_at, nowMs)
          })
          .slice(0, maxCampaigns)

    if (syncCandidates.length === 0) {
      return NextResponse.json({
        updated: 0,
        checked: 0,
        skipped: campaignsList.length,
        total: campaignsList.length,
        message: 'No stale campaigns to sync',
      })
    }

    // Group by connection to minimize token refreshes
    const campaignsByConnection = syncCandidates.reduce<Record<string, SyncCampaign[]>>((acc, campaign) => {
      const connId = campaign.klaviyo_connection_id
      if (!acc[connId]) acc[connId] = []
      acc[connId].push(campaign)
      return acc
    }, {})

    let updatedCount = 0
    let checkedCount = 0
    const updates: { id: string; oldStatus: string; newStatus: string }[] = []
    const syncTimestamp = new Date().toISOString()

    // Process each connection's campaigns
    for (const [connectionId, connectionCampaigns] of Object.entries(campaignsByConnection)) {
      // Get valid token for this connection
      const token = await getValidKlaviyoToken(supabaseAdmin, connectionId)

      if (!token) {
        console.log('Skipping connection (no valid token):', connectionId)
        await supabaseAdmin
          .from('campaigns')
          .update({ last_status_synced_at: syncTimestamp })
          .in('id', connectionCampaigns.map(c => c.id))
        continue
      }

      const wantedIds = new Set(
        connectionCampaigns
          .map((c) => c.klaviyo_campaign_id)
          .filter((id): id is string => Boolean(id))
      )

      const statusById = await fetchKlaviyoStatusesFromList(token, wantedIds)

      const missingForGet = connectionCampaigns.filter(
        (c) => c.klaviyo_campaign_id && !statusById.has(c.klaviyo_campaign_id)
      )

      await mapWithConcurrency(missingForGet, 4, async (campaign) => {
        const kid = campaign.klaviyo_campaign_id!
        const raw = await fetchKlaviyoStatusById(token, kid)
        if (raw) statusById.set(kid, raw)
      })

      for (const campaign of connectionCampaigns) {
        const kid = campaign.klaviyo_campaign_id
        if (!kid) continue

        checkedCount++
        try {
          const rawStatus = statusById.get(kid)
          if (rawStatus === undefined) {
            console.error('Failed to fetch campaign status:', kid)
            await supabaseAdmin
              .from('campaigns')
              .update({ last_status_synced_at: syncTimestamp })
              .eq('id', campaign.id)
            continue
          }

          const newStatus = mapKlaviyoStatus(rawStatus, campaign.status)

          const nextUpdate: { status?: LocalCampaignStatus; last_status_synced_at: string } = {
            last_status_synced_at: syncTimestamp,
          }
          if (campaign.status !== newStatus) {
            nextUpdate.status = newStatus
          }

          const { error: updateError } = await supabaseAdmin
            .from('campaigns')
            .update(nextUpdate)
            .eq('id', campaign.id)

          if (updateError) {
            console.error('Failed to persist campaign sync:', campaign.id, updateError)
            continue
          }

          if (campaign.status !== newStatus) {
            updatedCount++
            updates.push({
              id: campaign.id,
              oldStatus: campaign.status,
              newStatus,
            })
            console.log(`Updated campaign ${campaign.id}: ${campaign.status} -> ${newStatus}`)
          }
        } catch (err) {
          console.error('Error syncing campaign:', kid, err)
          await supabaseAdmin
            .from('campaigns')
            .update({ last_status_synced_at: syncTimestamp })
            .eq('id', campaign.id)
        }
      }
    }

    return NextResponse.json({
      updated: updatedCount,
      checked: checkedCount,
      total: campaignsList.length,
      considered: syncCandidates.length,
      skipped: Math.max(0, syncEligible.length - syncCandidates.length),
      updates,
    })
  } catch (err) {
    console.error('Sync status error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
