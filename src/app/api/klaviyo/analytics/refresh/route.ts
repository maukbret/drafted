import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { KlaviyoAnalyticsData } from '@/types/database'
import { discoverMetricIds, fetchPeriodData } from '@/lib/klaviyo-analytics'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { connectionId, periodStart, periodEnd, compStart, compEnd } = body

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

    const cacheKey = `${periodStart}_${periodEnd}`

    // Delete cached data to force re-fetch
    await supabase
      .from('klaviyo_analytics_cache')
      .delete()
      .eq('connection_id', connectionId)
      .eq('cache_key', cacheKey)

    // Load user's list/form preferences
    const { data: prefs } = await supabase
      .from('klaviyo_analytics_preferences')
      .select('selected_list_id, selected_form_id')
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .single()

    // Discover metric IDs
    const metricIds = await discoverMetricIds(supabase, connectionId)

    console.log('[Analytics] Metric IDs discovered (refresh):', metricIds)

    const current = await fetchPeriodData(supabase, connectionId, periodStart, periodEnd, metricIds, prefs?.selected_list_id)
    await new Promise((r) => setTimeout(r, 1500))
    const comparison = await fetchPeriodData(supabase, connectionId, compStart, compEnd, metricIds, prefs?.selected_list_id)

    const data: KlaviyoAnalyticsData = {
      totalRevenue: current.totalRevenue,
      compTotalRevenue: comparison.totalRevenue,
      attributedRevenue: current.attributedRevenue,
      compAttributedRevenue: comparison.attributedRevenue,
      campaigns: current.campaigns,
      compCampaigns: comparison.campaigns,
      flows: current.flows,
      compFlows: comparison.flows,
      listSubscribers: null,
      compListSubscribers: null,
      listNetNew: current.listNetNew,
      compListNetNew: comparison.listNetNew,
      formSubmits: null,
      compFormSubmits: null,
    }

    const fetchedAt = new Date().toISOString()

    await supabase
      .from('klaviyo_analytics_cache')
      .upsert({
        connection_id: connectionId,
        cache_key: cacheKey,
        period_start: periodStart,
        period_end: periodEnd,
        comp_period_start: compStart,
        comp_period_end: compEnd,
        data,
        fetched_at: fetchedAt,
      }, { onConflict: 'connection_id,cache_key' })

    return NextResponse.json({ data, fetched_at: fetchedAt })
  } catch (err) {
    console.error('[Analytics] Refresh error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
