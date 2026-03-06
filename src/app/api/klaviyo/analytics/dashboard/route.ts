import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { KlaviyoAnalyticsData } from '@/types/database'

async function verifyAnalyticsAccess(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<{ hasAccess: boolean; scope: string | null }> {
  const { data: ownConnection } = await supabase
    .from('klaviyo_connections')
    .select('id, scope')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .single()

  if (ownConnection) {
    return { hasAccess: true, scope: ownConnection.scope }
  }

  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .single()

  if (teamMembership?.role === 'admin') {
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')

    if (adminMembers && adminMembers.length > 0) {
      const { data: teamConnection } = await supabase
        .from('klaviyo_connections')
        .select('id, scope')
        .eq('id', connectionId)
        .in('user_id', adminMembers.map((m) => m.user_id))
        .single()

      if (teamConnection) {
        return { hasAccess: true, scope: teamConnection.scope }
      }
    }
  }

  return { hasAccess: false, scope: null }
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function sumRevenue(rows: Array<{ revenue: unknown }> | null | undefined): number {
  return (rows || []).reduce((sum, row) => sum + toNumber(row.revenue), 0)
}

function monthStartFromDate(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function monthEndFromDate(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  const y = end.getUTCFullYear()
  const m = String(end.getUTCMonth() + 1).padStart(2, '0')
  const day = String(end.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function aggregateMonthlyCampaignsById(
  rows: Array<{
    campaign_id: string
    campaign_name: string
    revenue: unknown
    open_rate: unknown
    click_rate: unknown
    delivered_count: unknown
  }> | null | undefined
) {
  const byId = new Map<string, {
    id: string
    name: string
    revenue: number
    deliveredCount: number
    openWeighted: number
    clickWeighted: number
    openUnweighted: number
    clickUnweighted: number
    unweightedCount: number
  }>()

  for (const row of rows || []) {
    const id = row.campaign_id
    if (!id) continue
    const revenue = toNumber(row.revenue)
    const delivered = toNumber(row.delivered_count)
    const openRate = toNumber(row.open_rate)
    const clickRate = toNumber(row.click_rate)

    const current = byId.get(id) || {
      id,
      name: row.campaign_name || 'Unknown',
      revenue: 0,
      deliveredCount: 0,
      openWeighted: 0,
      clickWeighted: 0,
      openUnweighted: 0,
      clickUnweighted: 0,
      unweightedCount: 0,
    }

    current.revenue += revenue
    current.deliveredCount += delivered
    if (delivered > 0) {
      current.openWeighted += openRate * delivered
      current.clickWeighted += clickRate * delivered
    } else {
      current.openUnweighted += openRate
      current.clickUnweighted += clickRate
      current.unweightedCount += 1
    }
    if (current.name === 'Unknown' && row.campaign_name) current.name = row.campaign_name

    byId.set(id, current)
  }

  return Array.from(byId.values())
    .map((c) => ({
      id: c.id,
      name: c.name,
      revenue: c.revenue,
      openRate: c.deliveredCount > 0
        ? c.openWeighted / c.deliveredCount
        : (c.unweightedCount > 0 ? c.openUnweighted / c.unweightedCount : 0),
      clickRate: c.deliveredCount > 0
        ? c.clickWeighted / c.deliveredCount
        : (c.unweightedCount > 0 ? c.clickUnweighted / c.unweightedCount : 0),
      deliveredCount: c.deliveredCount,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25)
}

function aggregateMonthlyFlowsById(
  rows: Array<{
    flow_id: string
    flow_name: string
    revenue: unknown
    open_rate: unknown
    click_rate: unknown
    delivered_count: unknown
  }> | null | undefined
) {
  const byId = new Map<string, {
    id: string
    name: string
    revenue: number
    deliveredCount: number
    openWeighted: number
    clickWeighted: number
    openUnweighted: number
    clickUnweighted: number
    unweightedCount: number
  }>()

  for (const row of rows || []) {
    const id = row.flow_id
    if (!id) continue
    const revenue = toNumber(row.revenue)
    const delivered = toNumber(row.delivered_count)
    const openRate = toNumber(row.open_rate)
    const clickRate = toNumber(row.click_rate)

    const current = byId.get(id) || {
      id,
      name: row.flow_name || 'Unknown',
      revenue: 0,
      deliveredCount: 0,
      openWeighted: 0,
      clickWeighted: 0,
      openUnweighted: 0,
      clickUnweighted: 0,
      unweightedCount: 0,
    }

    current.revenue += revenue
    current.deliveredCount += delivered
    if (delivered > 0) {
      current.openWeighted += openRate * delivered
      current.clickWeighted += clickRate * delivered
    } else {
      current.openUnweighted += openRate
      current.clickUnweighted += clickRate
      current.unweightedCount += 1
    }
    if (current.name === 'Unknown' && row.flow_name) current.name = row.flow_name

    byId.set(id, current)
  }

  return Array.from(byId.values())
    .map((f) => ({
      id: f.id,
      name: f.name,
      revenue: f.revenue,
      openRate: f.deliveredCount > 0
        ? f.openWeighted / f.deliveredCount
        : (f.unweightedCount > 0 ? f.openUnweighted / f.unweightedCount : 0),
      clickRate: f.deliveredCount > 0
        ? f.clickWeighted / f.deliveredCount
        : (f.unweightedCount > 0 ? f.clickUnweighted / f.unweightedCount : 0),
      deliveredCount: f.deliveredCount,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25)
}

/**
 * GET /api/klaviyo/analytics/dashboard
 * Reads from normalized analytics tables — no Klaviyo API calls
 *
 * Params: connectionId, periodStart, periodEnd, compStart, compEnd
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')
    const periodStart = searchParams.get('periodStart')
    const periodEnd = searchParams.get('periodEnd')
    const compStart = searchParams.get('compStart')
    const compEnd = searchParams.get('compEnd')

    if (!connectionId || !periodStart || !periodEnd || !compStart || !compEnd) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { hasAccess, scope } = await verifyAnalyticsAccess(supabase, user.id, connectionId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    if (!scope?.includes('metrics:read')) {
      return NextResponse.json({ requiresReconnect: true })
    }

    const service = createServiceClient()

    // Normalize both selections to full calendar-month ranges.
    const currentRangeStart = monthStartFromDate(periodStart)
    const currentRangeEnd = monthEndFromDate(periodEnd)
    const compRangeStart = monthStartFromDate(compStart)
    const compRangeEnd = monthEndFromDate(compEnd)

    // Fetch daily metrics for current normalized range
    const { data: currentDailyMetrics } = await service
      .from('analytics_daily_metrics')
      .select('total_revenue, subscribers, unsubscribes')
      .eq('connection_id', connectionId)
      .gte('date', currentRangeStart)
      .lte('date', currentRangeEnd)

    // Fetch daily metrics for comparison normalized range
    const { data: compDailyMetrics } = await service
      .from('analytics_daily_metrics')
      .select('total_revenue, subscribers, unsubscribes')
      .eq('connection_id', connectionId)
      .gte('date', compRangeStart)
      .lte('date', compRangeEnd)

    // Aggregate daily metrics
    const currentTotalRevenue = (currentDailyMetrics || []).reduce((s, r) => s + toNumber(r.total_revenue), 0)
    const currentSubscribers = (currentDailyMetrics || []).reduce((s, r) => s + toNumber(r.subscribers), 0)
    const currentUnsubscribes = (currentDailyMetrics || []).reduce((s, r) => s + toNumber(r.unsubscribes), 0)

    const compTotalRevenue = (compDailyMetrics || []).reduce((s, r) => s + toNumber(r.total_revenue), 0)
    const compSubscribers = (compDailyMetrics || []).reduce((s, r) => s + toNumber(r.subscribers), 0)
    const compUnsubscribes = (compDailyMetrics || []).reduce((s, r) => s + toNumber(r.unsubscribes), 0)

    // Determine months that overlap with each period for campaign/flow data
    const currentMonthStart = currentRangeStart.slice(0, 7) + '-01'
    const currentMonthEnd = currentRangeEnd.slice(0, 7) + '-01'
    const compMonthStart = compRangeStart.slice(0, 7) + '-01'
    const compMonthEnd = compRangeEnd.slice(0, 7) + '-01'

    // Fetch monthly campaigns snapshot rows for both ranges.
    const { data: currentMonthlyCampaigns } = await service
      .from('analytics_monthly_campaigns')
      .select('campaign_id, campaign_name, revenue, open_rate, click_rate, delivered_count')
      .eq('connection_id', connectionId)
      .gte('month', currentMonthStart)
      .lte('month', currentMonthEnd)
      .order('revenue', { ascending: false })

    const { data: compMonthlyCampaigns } = await service
      .from('analytics_monthly_campaigns')
      .select('campaign_id, campaign_name, revenue, open_rate, click_rate, delivered_count')
      .eq('connection_id', connectionId)
      .gte('month', compMonthStart)
      .lte('month', compMonthEnd)
      .order('revenue', { ascending: false })

    // Fetch monthly flows snapshot rows for both ranges.
    const { data: currentMonthlyFlows } = await service
      .from('analytics_monthly_flows')
      .select('flow_id, flow_name, revenue, open_rate, click_rate, delivered_count')
      .eq('connection_id', connectionId)
      .gte('month', currentMonthStart)
      .lte('month', currentMonthEnd)
      .order('revenue', { ascending: false })

    const { data: compMonthlyFlows } = await service
      .from('analytics_monthly_flows')
      .select('flow_id, flow_name, revenue, open_rate, click_rate, delivered_count')
      .eq('connection_id', connectionId)
      .gte('month', compMonthStart)
      .lte('month', compMonthEnd)
      .order('revenue', { ascending: false })

    // Fetch unbounded monthly revenue rows so attributed revenue math is not affected
    // by top-25 table limits.
    const { data: currentCampaignRevenueRows } = await service
      .from('analytics_monthly_campaigns')
      .select('revenue')
      .eq('connection_id', connectionId)
      .gte('month', currentMonthStart)
      .lte('month', currentMonthEnd)

    const { data: currentFlowRevenueRows } = await service
      .from('analytics_monthly_flows')
      .select('revenue')
      .eq('connection_id', connectionId)
      .gte('month', currentMonthStart)
      .lte('month', currentMonthEnd)

    const { data: compCampaignRevenueRows } = await service
      .from('analytics_monthly_campaigns')
      .select('revenue')
      .eq('connection_id', connectionId)
      .gte('month', compMonthStart)
      .lte('month', compMonthEnd)

    const { data: compFlowRevenueRows } = await service
      .from('analytics_monthly_flows')
      .select('revenue')
      .eq('connection_id', connectionId)
      .gte('month', compMonthStart)
      .lte('month', compMonthEnd)

    // Attributed revenue for reporting is sourced from monthly campaign + flow snapshots.
    const currentAttributedRevenueMonthly = sumRevenue(currentCampaignRevenueRows) + sumRevenue(currentFlowRevenueRows)
    const compAttributedRevenueMonthly = sumRevenue(compCampaignRevenueRows) + sumRevenue(compFlowRevenueRows)

    const currentAttributedRevenue = currentAttributedRevenueMonthly
    const compAttributedRevenue = compAttributedRevenueMonthly

    const currentFlowsAgg = aggregateMonthlyFlowsById(currentMonthlyFlows)
    const compFlowsAgg = aggregateMonthlyFlowsById(compMonthlyFlows)

    const currentCampaignsAgg = aggregateMonthlyCampaignsById(currentMonthlyCampaigns)
    const compCampaignsAgg = aggregateMonthlyCampaignsById(compMonthlyCampaigns)

    // Map to the existing KlaviyoAnalyticsData shape so sub-components work unchanged
    const data: KlaviyoAnalyticsData = {
      totalRevenue: currentTotalRevenue,
      compTotalRevenue: compTotalRevenue,
      attributedRevenue: currentAttributedRevenue,
      compAttributedRevenue: compAttributedRevenue,
      campaigns: currentCampaignsAgg,
      compCampaigns: compCampaignsAgg,
      flows: currentFlowsAgg,
      compFlows: compFlowsAgg,
      listSubscribers: currentSubscribers || null,
      compListSubscribers: compSubscribers || null,
      listNetNew: currentSubscribers - currentUnsubscribes || null,
      compListNetNew: compSubscribers - compUnsubscribes || null,
      formSubmits: null,
      compFormSubmits: null,
    }

    // Include sync status
    const { data: connection } = await service
      .from('klaviyo_connections')
      .select('analytics_synced_through')
      .eq('id', connectionId)
      .single()

    return NextResponse.json({
      data,
      syncedThrough: connection?.analytics_synced_through || null,
    })
  } catch (err) {
    console.error('[Analytics Dashboard] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
