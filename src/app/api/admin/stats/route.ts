import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/feature-access'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    const service = createServiceClient()

    // Default to today if no range provided
    const today = new Date().toISOString().slice(0, 10)
    const rangeStart = start ?? today
    const rangeEnd = (end ?? today) + 'T23:59:59Z'

    // Run all queries in parallel
    const [
      totalUsersResult,
      campaignsInRangeResult,
      reportsInRangeResult,
      klaviyoConnectionsResult,
      klaviyoFootersResult,
      defaultAudiencesResult,
      activeCampaignsResult,
      activeReportsResult,
      activeConnectionsResult,
      rangedCampaignsResult,
      rangedReportsResult,
      recentSignupsResult,
    ] = await Promise.all([
      service.from('profiles').select('*', { count: 'exact', head: true }),
      service.from('campaigns').select('*', { count: 'exact', head: true }).gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('analytics_reports').select('*', { count: 'exact', head: true }).gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('klaviyo_connections').select('*', { count: 'exact', head: true }),
      service.from('klaviyo_footers').select('*', { count: 'exact', head: true }),
      service.from('klaviyo_default_audiences').select('*', { count: 'exact', head: true }),
      service.from('campaigns').select('user_id').gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('analytics_reports').select('user_id').gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('klaviyo_connections').select('user_id').gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('campaigns').select('user_id').gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('analytics_reports').select('user_id').gte('created_at', rangeStart).lte('created_at', rangeEnd),
      service.from('profiles').select('id, full_name, created_at').order('created_at', { ascending: false }).limit(10),
    ])

    // Active users in range: distinct user_id across tables
    const activeUserIds = new Set<string>()
    for (const row of activeCampaignsResult.data ?? []) activeUserIds.add(row.user_id)
    for (const row of activeReportsResult.data ?? []) activeUserIds.add(row.user_id)
    for (const row of activeConnectionsResult.data ?? []) activeUserIds.add(row.user_id)

    // Top 10 users by campaign count in the selected period
    const campaignCountMap: Record<string, number> = {}
    for (const row of rangedCampaignsResult.data ?? []) {
      campaignCountMap[row.user_id] = (campaignCountMap[row.user_id] || 0) + 1
    }
    const reportCountMap: Record<string, number> = {}
    for (const row of rangedReportsResult.data ?? []) {
      reportCountMap[row.user_id] = (reportCountMap[row.user_id] || 0) + 1
    }

    const topUserIds = Object.entries(campaignCountMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId]) => userId)

    let topUsers: Array<{
      id: string
      email: string
      full_name: string | null
      campaigns: number
      reports: number
      plan: string | null
      last_active: string | null
      rank: number
    }> = []

    if (topUserIds.length > 0) {
      const [profilesResult, subscriptionsResult, authUsersResult] = await Promise.all([
        service.from('profiles').select('id, full_name, created_at').in('id', topUserIds),
        service.from('subscriptions').select('user_id, price_tier, status').in('user_id', topUserIds),
        service.auth.admin.listUsers({ perPage: 1000 }),
      ])

      const profileMap: Record<string, { full_name: string | null; created_at: string }> = {}
      for (const p of profilesResult.data ?? []) {
        profileMap[p.id] = { full_name: p.full_name, created_at: p.created_at }
      }

      const subMap: Record<string, { price_tier: string | null; status: string }> = {}
      for (const s of subscriptionsResult.data ?? []) {
        subMap[s.user_id] = { price_tier: s.price_tier, status: s.status }
      }

      const emailMap: Record<string, string> = {}
      for (const u of authUsersResult.data?.users ?? []) {
        emailMap[u.id] = u.email ?? ''
      }

      topUsers = topUserIds.map((userId, idx) => ({
        id: userId,
        email: emailMap[userId] ?? '',
        full_name: profileMap[userId]?.full_name ?? null,
        campaigns: campaignCountMap[userId] ?? 0,
        reports: reportCountMap[userId] ?? 0,
        plan: subMap[userId]?.price_tier ?? null,
        last_active: profileMap[userId]?.created_at ?? null,
        rank: idx + 1,
      }))
    }

    // Recent signups — need emails
    const recentProfileIds = (recentSignupsResult.data ?? []).map((p) => p.id)
    let recentSignups: Array<{
      id: string
      email: string
      full_name: string | null
      created_at: string
      plan: string | null
      plan_since: string | null
    }> = []

    if (recentProfileIds.length > 0) {
      const [recentSubsResult, recentAuthResult] = await Promise.all([
        service.from('subscriptions').select('user_id, price_tier, status, created_at').in('user_id', recentProfileIds),
        service.auth.admin.listUsers({ perPage: 1000 }),
      ])

      const recentSubMap: Record<string, { price_tier: string | null; created_at: string | null }> = {}
      for (const s of recentSubsResult.data ?? []) {
        recentSubMap[s.user_id] = { price_tier: s.price_tier, created_at: s.created_at }
      }

      const recentEmailMap: Record<string, string> = {}
      for (const u of recentAuthResult.data?.users ?? []) {
        recentEmailMap[u.id] = u.email ?? ''
      }

      recentSignups = (recentSignupsResult.data ?? []).map((p) => ({
        id: p.id,
        email: recentEmailMap[p.id] ?? '',
        full_name: p.full_name,
        created_at: p.created_at,
        plan: recentSubMap[p.id]?.price_tier ?? null,
        plan_since: recentSubMap[p.id]?.created_at ?? null,
      }))
    }

    return NextResponse.json({
      totalUsers: totalUsersResult.count ?? 0,
      activeUsersInRange: activeUserIds.size,
      campaignsInRange: campaignsInRangeResult.count ?? 0,
      reportsInRange: reportsInRangeResult.count ?? 0,
      klaviyoConnections: klaviyoConnectionsResult.count ?? 0,
      klaviyoFooters: klaviyoFootersResult.count ?? 0,
      defaultAudiences: defaultAudiencesResult.count ?? 0,
      topUsers,
      recentSignups,
    })
  } catch (err) {
    console.error('Admin stats error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
