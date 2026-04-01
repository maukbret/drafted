import { createClient } from '@/lib/supabase/server'
import { userCanUseKlaviyoConnection } from '@/lib/klaviyo-connection-access'
import { AnalyticsFetchError, discoverMetricIds, fetchAccountOverview, fetchPeriodData } from '@/lib/klaviyo-analytics'
import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { KlaviyoAnalyticsData } from '@/types/database'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 93
const MIN_REQUEST_INTERVAL_MS = 2000
const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 20
const TOP_N_DEFAULT = 5
const TOP_N_MAX = 10

type ThrottleState = {
  windowStart: number
  count: number
  lastRequestAt: number
}

const throttleByUserConnection = new Map<string, ThrottleState>()

async function verifyAnalyticsAccess(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<{ hasAccess: boolean; scope: string | null }> {
  const { data: row } = await supabase
    .from('klaviyo_connections')
    .select('scope, user_id')
    .eq('id', connectionId)
    .single()

  if (!row) {
    return { hasAccess: false, scope: null }
  }

  const allowed = await userCanUseKlaviyoConnection(supabase, userId, row.user_id)
  return { hasAccess: allowed, scope: allowed ? row.scope : null }
}

function parseDateInput(raw: string | null): Date | null {
  if (!raw || !DATE_RE.test(raw)) return null
  const parsed = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null

  const yyyy = parsed.getUTCFullYear()
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getUTCDate()).padStart(2, '0')

  if (`${yyyy}-${mm}-${dd}` !== raw) return null
  return parsed
}

function daySpanInclusive(start: Date, end: Date): number {
  const msPerDay = 86_400_000
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1
}

function parseTopN(raw: string | null): number {
  if (!raw) return TOP_N_DEFAULT
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return TOP_N_DEFAULT
  return Math.max(1, Math.min(TOP_N_MAX, Math.floor(parsed)))
}

function parseBooleanFlag(raw: string | null): boolean {
  if (!raw) return false
  return raw === '1' || raw.toLowerCase() === 'true'
}

function hasScope(scope: string | null, target: string): boolean {
  if (!scope) return false
  const decodedScope = decodeURIComponent(scope.replace(/\+/g, ' '))
  const granted = decodedScope
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  return granted.includes(target)
}

function enforceRequestThrottle(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now()
  const existing = throttleByUserConnection.get(key)

  if (!existing) {
    throttleByUserConnection.set(key, { windowStart: now, count: 1, lastRequestAt: now })
    return { allowed: true }
  }

  const sinceLast = now - existing.lastRequestAt
  if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((MIN_REQUEST_INTERVAL_MS - sinceLast) / 1000),
    }
  }

  if (now - existing.windowStart > RATE_WINDOW_MS) {
    throttleByUserConnection.set(key, { windowStart: now, count: 1, lastRequestAt: now })
    return { allowed: true }
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((RATE_WINDOW_MS - (now - existing.windowStart)) / 1000),
    }
  }

  existing.count += 1
  existing.lastRequestAt = now
  throttleByUserConnection.set(key, existing)
  return { allowed: true }
}

/**
 * GET /api/klaviyo/analytics/dashboard
 * Live-only analytics endpoint (no analytics data persisted in Supabase)
 *
 * Params: connectionId, periodStart, periodEnd, compStart, compEnd, topN?
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')
    const periodStart = searchParams.get('periodStart')
    const periodEnd = searchParams.get('periodEnd')
    const compStart = searchParams.get('compStart')
    const compEnd = searchParams.get('compEnd')
    const topN = parseTopN(searchParams.get('topN'))
    const includeListGrowth = parseBooleanFlag(searchParams.get('includeListGrowth'))
    const includeAccountOverview = parseBooleanFlag(searchParams.get('includeAccountOverview'))

    if (!connectionId || !periodStart || !periodEnd || !compStart || !compEnd) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const periodStartDate = parseDateInput(periodStart)
    const periodEndDate = parseDateInput(periodEnd)
    const compStartDate = parseDateInput(compStart)
    const compEndDate = parseDateInput(compEnd)

    if (!periodStartDate || !periodEndDate || !compStartDate || !compEndDate) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 })
    }

    if (periodStartDate > periodEndDate || compStartDate > compEndDate) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    if (daySpanInclusive(periodStartDate, periodEndDate) > MAX_RANGE_DAYS) {
      return NextResponse.json({
        error: `Date range too large. Maximum ${MAX_RANGE_DAYS} days allowed in live mode.`,
      }, { status: 400 })
    }

    if (daySpanInclusive(compStartDate, compEndDate) > MAX_RANGE_DAYS) {
      return NextResponse.json({
        error: `Comparison range too large. Maximum ${MAX_RANGE_DAYS} days allowed in live mode.`,
      }, { status: 400 })
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

    const hasMetricsRead = hasScope(scope, 'metrics:read')
    const hasSegmentsRead = hasScope(scope, 'segments:read')
    const hasSegmentsWrite = hasScope(scope, 'segments:write')

    if (!hasMetricsRead) {
      return NextResponse.json({ requiresReconnect: true })
    }

    if (includeListGrowth && !hasSegmentsRead) {
      return NextResponse.json(
        {
          error: 'This Klaviyo connection is missing segment permissions required for list growth reports. Delete and reconnect this account from Connections.',
          errorCode: 'managed_segment_scope_required',
          actionUrl: '/connections',
          requiresReconnect: true,
          missingScopes: ['segments:read'],
        },
        { status: 403 }
      )
    }

    const throttleKey = `${user.id}:${connectionId}`
    const throttleResult = enforceRequestThrottle(throttleKey)
    if (!throttleResult.allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please wait before refreshing again.',
          retryAfterSeconds: throttleResult.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(throttleResult.retryAfterSeconds) },
        }
      )
    }

    const metricIds = await discoverMetricIds(supabase, connectionId)
    if (!metricIds.placedOrderMetricId) {
      return NextResponse.json({
        error: 'Could not find Klaviyo Placed Order metric for this account.',
      }, { status: 422 })
    }

    const current = await fetchPeriodData(
      supabase,
      connectionId,
      periodStart,
      periodEnd,
      metricIds,
      {
        includeListGrowth,
        includeActiveProfiles: includeListGrowth,
        allowSegmentsRead: hasSegmentsRead,
        allowSegmentsWrite: hasSegmentsWrite,
      }
    )

    const comparison = await fetchPeriodData(
      supabase,
      connectionId,
      compStart,
      compEnd,
      metricIds
    )

    let accountOverview: KlaviyoAnalyticsData['accountOverview'] = null
    console.log('[Analytics Dashboard] Account overview check:', {
      includeAccountOverview,
      hasCampaignsRead: hasScope(scope, 'campaigns:read'),
      hasFlowsRead: hasScope(scope, 'flows:read'),
      scope: scope?.substring(0, 200),
    })
    if (includeAccountOverview && hasScope(scope, 'campaigns:read') && hasScope(scope, 'flows:read')) {
      console.log('[Analytics Dashboard] Fetching account overview, placedOrderMetricId:', metricIds.placedOrderMetricId)
      accountOverview = await fetchAccountOverview(
        supabase,
        connectionId,
        metricIds.placedOrderMetricId
      )
      console.log('[Analytics Dashboard] Account overview result:', accountOverview ? {
        months: accountOverview.months.length,
        sampleMonth: accountOverview.months[0],
        campaignRevenue: accountOverview.campaignRevenue.slice(0, 3),
        flowRevenue: accountOverview.flowRevenue.slice(0, 3),
      } : null)
    }

    const data: KlaviyoAnalyticsData = {
      totalRevenue: current.totalRevenue,
      compTotalRevenue: comparison.totalRevenue,
      attributedRevenue: current.attributedRevenue,
      compAttributedRevenue: comparison.attributedRevenue,
      campaigns: current.campaigns.slice(0, topN),
      compCampaigns: comparison.campaigns.slice(0, topN),
      flows: current.flows.slice(0, topN),
      compFlows: comparison.flows.slice(0, topN),
      ...(includeListGrowth
        ? {
            activeProfiles: current.activeProfiles,
            newSubscribers: current.newSubscribers,
            unsubscribers: current.unsubscribers,
            netGrowth: current.netGrowth,
            netGrowthPercent: current.netGrowthPercent,
          }
        : {}),
      ...(accountOverview ? { accountOverview } : {}),
    }

    const missingScopes = includeListGrowth && !hasSegmentsWrite ? ['segments:write'] : []

    return NextResponse.json({
      data,
      fetchedAt: new Date().toISOString(),
      source: 'live',
      ...(missingScopes.length > 0 ? { missingScopes } : {}),
    })
  } catch (err) {
    if (err instanceof AnalyticsFetchError) {
      const status = err.code === 'managed_segment_scope_required' ? 403 : 422
      return NextResponse.json(
        {
          error: err.message,
          errorCode: err.code,
          actionUrl: err.actionUrl || '/connections',
          requiresReconnect: err.code === 'managed_segment_scope_required',
        },
        { status }
      )
    }

    console.error('[Analytics Dashboard] Live fetch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
