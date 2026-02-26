import { SupabaseClient } from '@supabase/supabase-js'
import { klaviyoFetch } from '@/lib/klaviyo'
import { KlaviyoAnalyticsCampaign, KlaviyoAnalyticsFlow } from '@/types/database'

/** Convert a YYYY-MM-DD date string to an ISO 8601 datetime Klaviyo expects */
export function toKlaviyoDatetime(dateStr: string, endOfDay = false): string {
  const time = endOfDay ? 'T23:59:59+00:00' : 'T00:00:00+00:00'
  return `${dateStr}${time}`
}

/**
 * Returns the day after a YYYY-MM-DD date as an ISO 8601 datetime.
 * Used for metric-aggregates which only supports less-than (not less-or-equal).
 */
function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}T00:00:00+00:00`
}

export interface AnalyticsMetricIds {
  placedOrderMetricId: string | null
  subscribedMetricId: string | null
  unsubscribedMetricId: string | null
}

/** Fetch all metrics for a connection, paginating until done. */
async function fetchAllMetrics(
  supabase: SupabaseClient,
  connectionId: string
): Promise<Array<{ id: string; name: string }>> {
  const metrics: Array<{ id: string; name: string }> = []
  let nextUrl: string | null = '/api/metrics/'
  let pageCount = 0
  const maxPages = 10

  while (nextUrl && pageCount < maxPages) {
    const res = await klaviyoFetch(supabase, connectionId, nextUrl)

    if (!res) {
      console.error('[Analytics] fetchAllMetrics: null response (token issue?)')
      break
    }
    if (!res.ok) {
      const body = await res.text()
      console.error(`[Analytics] fetchAllMetrics: ${res.status}`, body)
      break
    }

    const data = await res.json()
    const page: any[] = data.data || []
    for (const m of page) {
      metrics.push({ id: m.id, name: m.attributes?.name || '' })
    }

    nextUrl = data.links?.next || null
    pageCount++
  }

  console.log(`[Analytics] Fetched ${metrics.length} metrics across ${pageCount} page(s)`)
  return metrics
}

export async function discoverMetricIds(
  supabase: SupabaseClient,
  connectionId: string
): Promise<AnalyticsMetricIds> {
  // Check if metric IDs are already cached on the connection row — they're stable
  // per Klaviyo account and don't need re-fetching on every refresh.
  const { data: conn } = await supabase
    .from('klaviyo_connections')
    .select('discovered_metric_ids')
    .eq('id', connectionId)
    .single()

  if (conn?.discovered_metric_ids != null) {
    console.log('[Analytics] Using cached metric IDs')
    return conn.discovered_metric_ids as AnalyticsMetricIds
  }

  const allMetrics = await fetchAllMetrics(supabase, connectionId)

  const find = (name: string) =>
    allMetrics.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null

  const metricIds: AnalyticsMetricIds = {
    placedOrderMetricId: find('Placed Order'),
    subscribedMetricId: find('Subscribed to List'),
    unsubscribedMetricId: find('Unsubscribed'),
  }

  console.log('[Analytics] Metric IDs discovered and cached:', metricIds)

  // Persist so future refreshes skip the paginated /api/metrics/ fetch
  await supabase
    .from('klaviyo_connections')
    .update({ discovered_metric_ids: metricIds })
    .eq('id', connectionId)

  return metricIds
}

export interface PeriodResult {
  totalRevenue: number
  attributedRevenue: number
  campaigns: KlaviyoAnalyticsCampaign[]
  flows: KlaviyoAnalyticsFlow[]
  listNetNew: number | null
}

export async function fetchPeriodData(
  supabase: SupabaseClient,
  connectionId: string,
  periodStart: string,  // YYYY-MM-DD
  periodEnd: string,    // YYYY-MM-DD
  metricIds: AnalyticsMetricIds,
  selectedListId?: string | null
): Promise<PeriodResult> {
  const { placedOrderMetricId, subscribedMetricId, unsubscribedMetricId } = metricIds

  // Klaviyo 2024-10-15: metric-aggregates uses filter[] for date range, not a timeframe object.
  // Supported operators: 'greater-or-equal' and 'less-than' only (no less-or-equal).
  // campaign/flow-values-reports still use a timeframe object with start/end datetimes.
  const startDt = toKlaviyoDatetime(periodStart, false)
  const endDt = toKlaviyoDatetime(periodEnd, true)
  const dateFilter = [
    `greater-or-equal(datetime,${startDt})`,
    `less-than(datetime,${dayAfter(periodEnd)})`,
  ]

  const promises: Promise<any>[] = []

  // --- Total revenue (Placed Order metric aggregate) ---
  if (placedOrderMetricId) {
    promises.push(
      klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'metric-aggregate',
            attributes: {
              metric_id: placedOrderMetricId,
              measurements: ['sum_value'],
              interval: 'month',
              by: [],
              filter: dateFilter,
            },
          },
        }),
      }).then(async (r) => {
        if (!r) {
          console.error('[Analytics] metric-aggregates (revenue): null response (token issue)')
          return { totalRevenue: 0 }
        }
        if (!r.ok) {
          const body = await r.text()
          console.error(`[Analytics] metric-aggregates (revenue): ${r.status}`, body)
          return { totalRevenue: 0 }
        }
        const d = await r.json()
        const results: any[] = d.data?.attributes?.results || []
        const total = results.reduce((acc: number, row: any) => {
          const vals: number[] = row.measurements?.sum_value || []
          return acc + vals.reduce((s, v) => s + (v || 0), 0)
        }, 0)
        return { totalRevenue: total }
      })
    )
  } else {
    promises.push(Promise.resolve({ totalRevenue: 0 }))
  }

  // --- Campaign metrics ---
  // Klaviyo 2024-10-15: 'revenue' → 'conversion_value', 'delivered_count' → 'recipients_count'
  if (placedOrderMetricId) {
    promises.push(
      klaviyoFetch(supabase, connectionId, '/api/campaign-values-reports/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'campaign-values-report',
            attributes: {
              timeframe: { start: startDt, end: endDt },
              conversion_metric_id: placedOrderMetricId,
              statistics: ['open_rate', 'click_rate', 'conversion_value'],
            },
          },
        }),
      }).then(async (r) => {
        if (!r) {
          console.error('[Analytics] campaign-values-reports: null response (token issue)')
          return { campaigns: [], attributedRevenue: 0 }
        }
        if (!r.ok) {
          const body = await r.text()
          console.error(`[Analytics] campaign-values-reports: ${r.status}`, body)
          return { campaigns: [], attributedRevenue: 0 }
        }
        const d = await r.json()
        const results: any[] = d.data?.attributes?.results || []
        let attributedRevenue = 0
        const campaigns: KlaviyoAnalyticsCampaign[] = results.map((row: any) => {
          const revenue = row.statistics?.conversion_value || 0
          attributedRevenue += revenue
          return {
            id: row.campaign_id || '',
            name: row.campaign_name || 'Unknown',
            revenue,
            openRate: row.statistics?.open_rate || 0,
            clickRate: row.statistics?.click_rate || 0,
            deliveredCount: 0,
          }
        })
        return { campaigns, attributedRevenue }
      })
    )
  } else {
    promises.push(Promise.resolve({ campaigns: [], attributedRevenue: 0 }))
  }

  // --- Flow metrics ---
  // Same stat name fixes as campaigns
  if (placedOrderMetricId) {
    promises.push(
      klaviyoFetch(supabase, connectionId, '/api/flow-values-reports/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'flow-values-report',
            attributes: {
              timeframe: { start: startDt, end: endDt },
              conversion_metric_id: placedOrderMetricId,
              statistics: ['open_rate', 'click_rate', 'conversion_value'],
            },
          },
        }),
      }).then(async (r) => {
        if (!r) {
          console.error('[Analytics] flow-values-reports: null response (token issue)')
          return { flows: [], flowAttributedRevenue: 0 }
        }
        if (!r.ok) {
          const body = await r.text()
          console.error(`[Analytics] flow-values-reports: ${r.status}`, body)
          return { flows: [], flowAttributedRevenue: 0 }
        }
        const d = await r.json()
        const results: any[] = d.data?.attributes?.results || []
        let flowAttributedRevenue = 0
        const flows: KlaviyoAnalyticsFlow[] = results.map((row: any) => {
          const revenue = row.statistics?.conversion_value || 0
          flowAttributedRevenue += revenue
          return {
            id: row.flow_id || '',
            name: row.flow_name || 'Unknown',
            revenue,
            openRate: row.statistics?.open_rate || 0,
            clickRate: row.statistics?.click_rate || 0,
            deliveredCount: 0,
          }
        })
        return { flows, flowAttributedRevenue }
      })
    )
  } else {
    promises.push(Promise.resolve({ flows: [], flowAttributedRevenue: 0 }))
  }

  // --- List new subscribers ---
  if (selectedListId && subscribedMetricId) {
    promises.push(
      klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'metric-aggregate',
            attributes: {
              metric_id: subscribedMetricId,
              measurements: ['count'],
              interval: 'month',
              by: [],
              filter: [...dateFilter, `equals(list,"${selectedListId}")`],
            },
          },
        }),
      }).then(async (r) => {
        if (!r?.ok) {
          if (r) {
            const body = await r.text()
            console.error(`[Analytics] metric-aggregates (list new): ${r.status}`, body)
          }
          return { listNew: null }
        }
        const d = await r.json()
        const results: any[] = d.data?.attributes?.results || []
        const count = results.reduce((acc: number, row: any) => {
          const vals: number[] = row.measurements?.count || []
          return acc + vals.reduce((s, v) => s + (v || 0), 0)
        }, 0)
        return { listNew: count }
      })
    )
  } else {
    promises.push(Promise.resolve({ listNew: null }))
  }

  // --- List unsubscribes ---
  if (selectedListId && unsubscribedMetricId) {
    promises.push(
      klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'metric-aggregate',
            attributes: {
              metric_id: unsubscribedMetricId,
              measurements: ['count'],
              interval: 'month',
              by: [],
              filter: [...dateFilter, `equals(list,"${selectedListId}")`],
            },
          },
        }),
      }).then(async (r) => {
        if (!r?.ok) {
          if (r) {
            const body = await r.text()
            console.error(`[Analytics] metric-aggregates (list unsub): ${r.status}`, body)
          }
          return { listUnsub: null }
        }
        const d = await r.json()
        const results: any[] = d.data?.attributes?.results || []
        const count = results.reduce((acc: number, row: any) => {
          const vals: number[] = row.measurements?.count || []
          return acc + vals.reduce((s, v) => s + (v || 0), 0)
        }, 0)
        return { listUnsub: count }
      })
    )
  } else {
    promises.push(Promise.resolve({ listUnsub: null }))
  }

  const [revenueResult, campaignResult, flowResult, listNewResult, listUnsubResult] = await Promise.all(promises)

  const attributedRevenue = (campaignResult.attributedRevenue || 0) + (flowResult.flowAttributedRevenue || 0)
  const listNetNew = (listNewResult.listNew !== null && listUnsubResult.listUnsub !== null)
    ? (listNewResult.listNew - listUnsubResult.listUnsub)
    : null

  return {
    totalRevenue: revenueResult?.totalRevenue || 0,
    attributedRevenue,
    campaigns: (campaignResult.campaigns || []).sort((a: KlaviyoAnalyticsCampaign, b: KlaviyoAnalyticsCampaign) => b.revenue - a.revenue),
    flows: (flowResult.flows || []).sort((a: KlaviyoAnalyticsFlow, b: KlaviyoAnalyticsFlow) => b.revenue - a.revenue),
    listNetNew,
  }
}
