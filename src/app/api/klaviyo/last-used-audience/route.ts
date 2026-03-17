import { createClient } from '@/lib/supabase/server'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { KlaviyoAudience } from '@/types/database'
import { NextRequest, NextResponse } from 'next/server'

function parseAudienceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const ids: string[] = []

  for (const id of value) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      continue
    }
    seen.add(id)
    ids.push(id)
  }

  return ids
}

function resolveAudiences(ids: string[], audiencesById: Map<string, KlaviyoAudience>) {
  return ids
    .map((id) => audiencesById.get(id))
    .filter((audience): audience is KlaviyoAudience => !!audience)
}

function timestampFrom(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this connection (own or team admin's)
    let hasAccess = false

    // Check if user owns this connection
    const { data: ownConnection } = await supabase
      .from('klaviyo_connections')
      .select('id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (ownConnection) {
      hasAccess = true
    } else {
      // Check if connection belongs to a team admin
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .single()

      if (teamMembership) {
        const { data: adminMembers } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamMembership.team_id)
          .eq('role', 'admin')

        if (adminMembers && adminMembers.length > 0) {
          const { data: teamConnection } = await supabase
            .from('klaviyo_connections')
            .select('id')
            .eq('id', connectionId)
            .in('user_id', adminMembers.map((member) => member.user_id))
            .single()

          if (teamConnection) {
            hasAccess = true
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Get valid token (refreshes automatically if needed)
    const klaviyoToken = await getValidKlaviyoToken(supabase, connectionId)

    if (!klaviyoToken) {
      return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect Klaviyo.' }, { status: 401 })
    }

    const headers = {
      'Authorization': `Bearer ${klaviyoToken}`,
      'Accept': 'application/json',
      'revision': '2026-01-15',
    }

    const campaignFilter = encodeURIComponent("and(equals(messages.channel,'email'),equals(status,'Sent'))")
    const fetchSentCampaigns = async () => {
      const items: Array<Record<string, any>> = []
      let nextUrl: string | null = `https://a.klaviyo.com/api/campaigns?filter=${campaignFilter}&sort=-updated_at`
      let pageCount = 0
      const maxPages = 20

      while (nextUrl && pageCount < maxPages) {
        const response: Response = await fetch(nextUrl, { headers })
        if (!response.ok) {
          const errorBody = await response.text()
          console.error('Klaviyo campaigns API error:', response.status, errorBody)
          throw new Error('Failed to fetch sent campaigns')
        }

        const data: any = await response.json()
        const pageItems = Array.isArray(data.data) ? (data.data as Array<Record<string, any>>) : []
        items.push(...pageItems)

        nextUrl = data.links?.next || null
        pageCount += 1
      }

      if (pageCount >= maxPages) {
        console.error('Klaviyo campaigns pagination exceeded max pages')
      }

      return items
    }

    let campaigns: Array<Record<string, any>> = []
    try {
      campaigns = await fetchSentCampaigns()
    } catch {
      return NextResponse.json({ error: 'Failed to fetch last used campaign' }, { status: 502 })
    }

    let campaign: Record<string, any> | null = null
    for (const candidate of campaigns) {
      if (!candidate) continue

      const candidateSendAt = timestampFrom(candidate.attributes?.send_time)
      const latestSendAt = timestampFrom(campaign?.attributes?.send_time)

      if (candidateSendAt > latestSendAt) {
        campaign = candidate
        continue
      }

      if (candidateSendAt === latestSendAt) {
        const candidateUpdatedAt = timestampFrom(candidate.attributes?.updated_at)
        const latestUpdatedAt = timestampFrom(campaign?.attributes?.updated_at)
        if (candidateUpdatedAt > latestUpdatedAt) {
          campaign = candidate
        }
      }
    }

    if (!campaign) {
      return NextResponse.json({ lastUsedAudience: null })
    }

    const includedIds = parseAudienceIds(campaign.attributes?.audiences?.included)
    const excludedIds = parseAudienceIds(campaign.attributes?.audiences?.excluded)

    const fetchAllPages = async (baseUrl: string) => {
      const items: any[] = []
      let nextUrl: string | null = baseUrl
      let pageCount = 0
      const maxPages = 200

      while (nextUrl && pageCount < maxPages) {
        const response: Response = await fetch(nextUrl, { headers })
        if (!response.ok) {
          throw new Error(`Klaviyo API error ${response.status} for ${baseUrl}`)
        }
        const data = await response.json()
        items.push(...(data.data || []))
        nextUrl = data.links?.next || null
        pageCount += 1
      }

      if (pageCount >= maxPages) {
        console.error('Klaviyo pagination exceeded max pages for', baseUrl)
      }

      return items
    }

    const [listsData, segmentsData] = await Promise.all([
      fetchAllPages('https://a.klaviyo.com/api/lists'),
      fetchAllPages('https://a.klaviyo.com/api/segments'),
    ])

    const lists = (listsData || []).map((list: any) => ({
      id: list.id,
      name: list.attributes?.name || 'Unnamed List',
      type: 'list' as const,
    }))

    const segments = (segmentsData || []).map((segment: any) => ({
      id: segment.id,
      name: segment.attributes?.name || 'Unnamed Segment',
      type: 'segment' as const,
    }))

    const audiencesById = new Map<string, KlaviyoAudience>(
      [...lists, ...segments].map((audience) => [audience.id, audience])
    )

    return NextResponse.json({
      lastUsedAudience: {
        campaignName: campaign.attributes?.name || 'Unnamed Campaign',
        sentAt: campaign.attributes?.send_time || null,
        includedAudiences: resolveAudiences(includedIds, audiencesById),
        excludedAudiences: resolveAudiences(excludedIds, audiencesById),
      },
    })
  } catch (err) {
    console.error('Fetch last used audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
