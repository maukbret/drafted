import { SupabaseClient } from '@supabase/supabase-js'
import { klaviyoFetch } from '@/lib/klaviyo'

/** Convert a YYYY-MM-DD date string to an ISO 8601 datetime Klaviyo expects */
export function toKlaviyoDatetime(dateStr: string, endOfDay = false): string {
  const time = endOfDay ? 'T23:59:59+00:00' : 'T00:00:00+00:00'
  return `${dateStr}${time}`
}

export interface AnalyticsMetricIds {
  placedOrderMetricId: string | null
  subscribedMetricId: string | null
  unsubscribedMetricId: string | null
}

function findMetricsFromList(allMetrics: Array<{ id: string; name: string }>): AnalyticsMetricIds {
  const allLower = allMetrics.map((m) => ({ ...m, lower: m.name.toLowerCase() }))
  const find = (name: string) => allLower.find((m) => m.lower === name.toLowerCase())?.id ?? null

  return {
    placedOrderMetricId: find('Placed Order'),
    subscribedMetricId: find('Subscribed to List'),
    unsubscribedMetricId: find('Unsubscribed'),
  }
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
    const cached = conn.discovered_metric_ids as Partial<AnalyticsMetricIds>
    return {
      placedOrderMetricId: cached.placedOrderMetricId ?? null,
      subscribedMetricId: cached.subscribedMetricId ?? null,
      unsubscribedMetricId: cached.unsubscribedMetricId ?? null,
    }
  }

  const allMetrics = await fetchAllMetrics(supabase, connectionId)
  const metricIds = findMetricsFromList(allMetrics)

  console.log('[Analytics] Metric IDs discovered and cached:', metricIds)

  // Persist so future refreshes skip the paginated /api/metrics/ fetch
  await supabase
    .from('klaviyo_connections')
    .update({ discovered_metric_ids: metricIds })
    .eq('id', connectionId)

  return metricIds
}
