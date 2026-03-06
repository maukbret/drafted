import { SupabaseClient } from '@supabase/supabase-js'
import { klaviyoFetch } from '@/lib/klaviyo'
import {
  discoverMetricIds,
  toKlaviyoDatetime,
  type AnalyticsMetricIds,
} from '@/lib/klaviyo-analytics'
import type { AnalyticsSyncStep, AnalyticsSyncTrigger } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers (reused from klaviyo-analytics.ts patterns)
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function numberFromValue(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number' || typeof value === 'string') return toFiniteNumber(value)
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + numberFromValue(item), 0)
  if (typeof value !== 'object') return 0
  const record = value as Record<string, unknown>
  if ('$value' in record) return numberFromValue(record.$value)
  if ('value' in record) return numberFromValue(record.value)
  if ('sum_value' in record) return numberFromValue(record.sum_value)
  if ('count' in record) return numberFromValue(record.count)
  if ('amount' in record) return numberFromValue(record.amount)
  return Object.values(record).reduce((sum: number, item) => sum + numberFromValue(item), 0)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rateLimitWaitMs(body: string, retryAfterHeader: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000) + 500
  }

  // Klaviyo often returns "Expected available in X seconds." in error detail.
  const match = body.match(/available in\s+(\d+)\s+seconds?/i)
  if (match) {
    return Number(match[1]) * 1000 + 500
  }

  return 3000
}

function resultRows(payload: any): any[] {
  const rows =
    payload?.data?.attributes?.results
    ?? payload?.data?.attributes?.data
    ?? payload?.data?.attributes?.series
    ?? []
  return Array.isArray(rows) ? rows : []
}

function statValue(row: any, key: string): unknown {
  const stats = row?.statistics
  if (!stats || typeof stats !== 'object') return null
  return stats[key] ?? stats[key.replace(/_/g, '-')] ?? stats[key.replace(/_/g, '')] ?? null
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function includedNameMap(payload: any): Map<string, string> {
  const map = new Map<string, string>()
  const included = Array.isArray(payload?.included) ? payload.included : []
  for (const item of included) {
    const id = firstString(item?.id)
    const name = firstString(item?.attributes?.name, item?.attributes?.label)
    if (id && name) map.set(id, name)
  }
  return map
}

function campaignIdFromRow(row: any): string {
  return firstString(
    row?.campaign_id, row?.campaignId, row?.campaign, row?.campaign?.id,
    row?.campaign?.data?.id, row?.relationships?.campaign?.data?.id,
    row?.dimensions?.['$campaign'], row?.dimension_values?.['$campaign'], row?.groupings?.['$campaign'],
    row?.dimensions?.['$attributed_campaign'], row?.dimension_values?.['$attributed_campaign'], row?.groupings?.['$attributed_campaign'],
    row?.dimensions?.campaign_id, row?.dimension_values?.campaign_id,
    row?.groupings?.campaign_id
  ) || ''
}

function campaignMessageIdFromRow(row: any): string {
  return firstString(
    row?.campaign_message_id, row?.campaignMessageId, row?.message_id, row?.messageId,
    row?.relationships?.campaign_message?.data?.id, row?.relationships?.message?.data?.id,
    row?.dimensions?.campaign_message_id, row?.dimension_values?.campaign_message_id,
    row?.groupings?.campaign_message_id, row?.id
  ) || ''
}

function campaignNameFromRow(row: any): string {
  return firstString(
    row?.campaign_name, row?.campaignName, row?.campaign_message_name,
    row?.campaignMessageName, row?.campaign?.name, row?.campaign?.attributes?.name,
    row?.dimensions?.campaign_name, row?.dimension_values?.campaign_name,
    row?.groupings?.campaign_name, row?.name
  ) || 'Unknown'
}

function flowIdFromRow(row: any): string {
  return firstString(
    row?.flow_id, row?.flowId, row?.flow, row?.flow?.id,
    row?.flow?.data?.id, row?.relationships?.flow?.data?.id,
    row?.dimensions?.['$flow'], row?.dimension_values?.['$flow'], row?.groupings?.['$flow'],
    row?.dimensions?.['$attributed_flow'], row?.dimension_values?.['$attributed_flow'], row?.groupings?.['$attributed_flow'],
    row?.dimensions?.flow_id, row?.dimension_values?.flow_id,
    row?.groupings?.flow_id
  ) || ''
}

function flowNameFromRow(row: any): string {
  return firstString(
    row?.flow_name, row?.flowName, row?.flow?.name, row?.flow?.attributes?.name,
    row?.dimensions?.flow_name, row?.dimension_values?.flow_name,
    row?.groupings?.flow_name, row?.name
  ) || 'Unknown'
}

function attributedMessageIdFromRow(row: any): string {
  return firstString(
    row?.message_id, row?.messageId, row?.id,
    row?.dimensions?.['$attributed_message'], row?.dimension_values?.['$attributed_message'], row?.groupings?.['$attributed_message'],
    row?.dimensions?.['$message'], row?.dimension_values?.['$message'], row?.groupings?.['$message'],
    row?.dimensions?.attributed_message_id, row?.dimension_values?.attributed_message_id, row?.groupings?.attributed_message_id
  ) || ''
}

interface RankedEntityRow {
  primaryId: string
  name: string
  revenue: number
  openRate: number
  clickRate: number
  deliveredCount: number
}

/**
 * Klaviyo value reports can return multiple rows per entity (for example, one per message).
 * Aggregate rows to a single per-ID record before persisting to monthly tables.
 */
function aggregateRowsByPrimaryId(rows: RankedEntityRow[]): RankedEntityRow[] {
  const byId = new Map<string, {
    name: string
    revenue: number
    deliveredCount: number
    openWeightedSum: number
    clickWeightedSum: number
    openUnweightedSum: number
    clickUnweightedSum: number
    unweightedCount: number
  }>()

  for (const row of rows) {
    if (!row.primaryId) continue

    const existing = byId.get(row.primaryId) || {
      name: row.name,
      revenue: 0,
      deliveredCount: 0,
      openWeightedSum: 0,
      clickWeightedSum: 0,
      openUnweightedSum: 0,
      clickUnweightedSum: 0,
      unweightedCount: 0,
    }

    // Prefer a non-Unknown name if we have one.
    if (existing.name === 'Unknown' && row.name !== 'Unknown') {
      existing.name = row.name
    }

    existing.revenue += row.revenue
    existing.deliveredCount += row.deliveredCount

    if (row.deliveredCount > 0) {
      existing.openWeightedSum += row.openRate * row.deliveredCount
      existing.clickWeightedSum += row.clickRate * row.deliveredCount
    } else {
      existing.openUnweightedSum += row.openRate
      existing.clickUnweightedSum += row.clickRate
      existing.unweightedCount += 1
    }

    byId.set(row.primaryId, existing)
  }

  return Array.from(byId.entries()).map(([primaryId, agg]) => {
    const openRate = agg.deliveredCount > 0
      ? agg.openWeightedSum / agg.deliveredCount
      : (agg.unweightedCount > 0 ? agg.openUnweightedSum / agg.unweightedCount : 0)
    const clickRate = agg.deliveredCount > 0
      ? agg.clickWeightedSum / agg.deliveredCount
      : (agg.unweightedCount > 0 ? agg.clickUnweightedSum / agg.unweightedCount : 0)

    return {
      primaryId,
      name: agg.name,
      revenue: agg.revenue,
      openRate,
      clickRate,
      deliveredCount: agg.deliveredCount,
    }
  })
}

/** Returns the day after a YYYY-MM-DD date as an ISO 8601 datetime */
function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}T00:00:00+00:00`
}

/** Returns YYYY-MM-DD for the first day of the given month */
export function monthStart(month: Date | string): string {
  const d = typeof month === 'string' ? new Date(`${month}T00:00:00Z`) : month
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/** Returns YYYY-MM-DD for the last day of the given month */
export function monthEnd(month: Date | string): string {
  const d = typeof month === 'string' ? new Date(`${month}T00:00:00Z`) : month
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  const y = next.getUTCFullYear()
  const m = String(next.getUTCMonth() + 1).padStart(2, '0')
  const day = String(next.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Name hydration (simplified — single-pass for sync, no in-memory cache needed)
// ---------------------------------------------------------------------------

async function hydrateOneCampaignName(
  supabase: SupabaseClient,
  connectionId: string,
  id: string
): Promise<string | null> {
  const encodedId = encodeURIComponent(id)

  // Try direct campaign lookup
  const res = await klaviyoFetch(supabase, connectionId, `/api/campaigns/${encodedId}/`)
  if (res?.ok) {
    const data = await res.json()
    const name = firstString(data?.data?.attributes?.name, data?.data?.attributes?.label)
    if (name) return name
  }

  // Try campaign-message lookup (some reports return message IDs)
  const msgRes = await klaviyoFetch(supabase, connectionId, `/api/campaign-messages/${encodedId}/?include=campaign`)
  if (msgRes?.ok) {
    const msgData = await msgRes.json()
    const included = includedNameMap(msgData)
    const name = firstString(
      msgData?.data?.attributes?.name,
      msgData?.data?.attributes?.label,
      included.get(firstString(msgData?.data?.relationships?.campaign?.data?.id) || '')
    )
    if (name) return name
  }

  return null
}

async function hydrateOneFlowName(
  supabase: SupabaseClient,
  connectionId: string,
  id: string
): Promise<string | null> {
  const encodedId = encodeURIComponent(id)

  const res = await klaviyoFetch(supabase, connectionId, `/api/flows/${encodedId}/`)
  if (res?.ok) {
    const data = await res.json()
    const name = firstString(data?.data?.attributes?.name, data?.data?.attributes?.label)
    if (name) return name
  }

  const msgRes = await klaviyoFetch(supabase, connectionId, `/api/flow-messages/${encodedId}/?include=flow`)
  if (msgRes?.ok) {
    const msgData = await msgRes.json()
    const included = includedNameMap(msgData)
    const name = firstString(
      msgData?.data?.attributes?.name,
      msgData?.data?.attributes?.label,
      included.get(firstString(msgData?.data?.relationships?.flow?.data?.id) || '')
    )
    if (name) return name
  }

  const actionRes = await klaviyoFetch(supabase, connectionId, `/api/flow-actions/${encodedId}/?include=flow`)
  if (actionRes?.ok) {
    const actionData = await actionRes.json()
    const included = includedNameMap(actionData)
    const name = firstString(
      actionData?.data?.attributes?.name,
      actionData?.data?.attributes?.label,
      included.get(firstString(actionData?.data?.relationships?.flow?.data?.id) || '')
    )
    if (name) return name
  }

  return null
}

// ---------------------------------------------------------------------------
// Sync Steps
// ---------------------------------------------------------------------------

interface SyncStepResult {
  success: boolean
  error?: string
}

async function syncDailyMetrics(
  supabase: SupabaseClient,
  connectionId: string,
  month: string,
  metricIds: AnalyticsMetricIds
): Promise<SyncStepResult> {
  const start = monthStart(month)
  const end = monthEnd(month)
  const startDt = toKlaviyoDatetime(start, false)
  const endExclusiveDt = dayAfter(end)
  const dateFilter = [
    `greater-or-equal(datetime,${startDt})`,
    `less-than(datetime,${endExclusiveDt})`,
  ]

  // Fetch revenue by day
  const revenueByDay = new Map<string, number>()
  const attributedByDay = new Map<string, number>()

  if (metricIds.placedOrderMetricId) {
    let revenueRes: Response | null = null
    let revenueRateBody = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      revenueRes = await klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'metric-aggregate',
            attributes: {
              metric_id: metricIds.placedOrderMetricId,
              measurements: ['sum_value'],
              interval: 'day',
              by: [],
              filter: dateFilter,
            },
          },
        }),
      })

      if (!revenueRes) break
      if (revenueRes.status !== 429) break

      revenueRateBody = await revenueRes.text().catch(() => '')
      if (attempt < 2) {
        await sleep(rateLimitWaitMs(revenueRateBody, revenueRes.headers.get('retry-after')))
      }
    }

    if (!revenueRes) return { success: false, error: 'Klaviyo API returned null (token issue)' }
    if (revenueRes.status === 429) {
      const body = revenueRateBody || await revenueRes.text()
      return { success: false, error: `Rate limited after retries: ${body}` }
    }
    if (!revenueRes.ok) {
      const body = await revenueRes.text()
      return { success: false, error: `metric-aggregates revenue: ${revenueRes.status} ${body}` }
    }

    const revenueData = await revenueRes.json()
    const revenueDates: string[] = revenueData?.data?.attributes?.dates ?? []
    const revenueRows = resultRows(revenueData)
    for (const row of revenueRows) {
      const values: unknown[] = row?.measurements?.sum_value ?? []
      for (let i = 0; i < revenueDates.length; i++) {
        const dateKey = revenueDates[i]?.slice(0, 10)
        if (dateKey) {
          revenueByDay.set(dateKey, (revenueByDay.get(dateKey) || 0) + numberFromValue(values[i]))
        }
      }
    }

    // Fetch attributed revenue by day directly from placed-order metric split by attributed message.
    const byCandidates = ['$attributed_message', '$message']
    let attributedLoaded = false
    let attributedError: string | null = null

    for (const byDimension of byCandidates) {
      let attributedRes: Response | null = null
      let attributedRateBody = ''

      for (let attempt = 0; attempt < 2; attempt++) {
        attributedRes = await klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              type: 'metric-aggregate',
              attributes: {
                metric_id: metricIds.placedOrderMetricId,
                measurements: ['sum_value'],
                interval: 'day',
                by: [byDimension],
                filter: dateFilter,
              },
            },
          }),
        })

        if (!attributedRes) break
        if (attributedRes.status !== 429) break

        attributedRateBody = await attributedRes.text().catch(() => '')
        if (attempt < 1) {
          await sleep(rateLimitWaitMs(attributedRateBody, attributedRes.headers.get('retry-after')))
        }
      }

      if (!attributedRes) {
        attributedError = 'null response'
        continue
      }

      if (!attributedRes.ok) {
        const body = attributedRes.status === 429
          ? attributedRateBody
          : await attributedRes.text().catch(() => '')
        attributedError = `${attributedRes.status} ${body}`
        continue
      }

      const attributedData = await attributedRes.json()
      const attributedDates: string[] = attributedData?.data?.attributes?.dates ?? []
      const attributedRows = resultRows(attributedData)

      for (const row of attributedRows) {
        const attributedMessageId = attributedMessageIdFromRow(row)
        if (!attributedMessageId) continue
        const values: unknown[] = row?.measurements?.sum_value ?? []
        for (let i = 0; i < attributedDates.length; i++) {
          const dateKey = attributedDates[i]?.slice(0, 10)
          if (dateKey) {
            attributedByDay.set(dateKey, (attributedByDay.get(dateKey) || 0) + numberFromValue(values[i]))
          }
        }
      }

      attributedLoaded = true
      break
    }

    if (!attributedLoaded && attributedError) {
      console.warn('[Analytics] daily attributed revenue aggregate failed:', attributedError)
    }
  }

  // Fetch subscriber counts by day
  const subscribersByDay = new Map<string, number>()
  if (metricIds.subscribedMetricId) {
    const res = await klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'metric-aggregate',
          attributes: {
            metric_id: metricIds.subscribedMetricId,
            measurements: ['count'],
            interval: 'day',
            by: [],
            filter: dateFilter,
          },
        },
      }),
    })
    if (res?.ok) {
      const data = await res.json()
      const dates: string[] = data?.data?.attributes?.dates ?? []
      const rows = resultRows(data)
      for (const row of rows) {
        const values: unknown[] = row?.measurements?.count ?? []
        for (let i = 0; i < dates.length; i++) {
          const dateKey = dates[i]?.slice(0, 10)
          if (dateKey) {
            subscribersByDay.set(dateKey, (subscribersByDay.get(dateKey) || 0) + numberFromValue(values[i]))
          }
        }
      }
    }
  }

  // Fetch unsubscribe counts by day
  const unsubsByDay = new Map<string, number>()
  if (metricIds.unsubscribedMetricId) {
    const res = await klaviyoFetch(supabase, connectionId, '/api/metric-aggregates/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'metric-aggregate',
          attributes: {
            metric_id: metricIds.unsubscribedMetricId,
            measurements: ['count'],
            interval: 'day',
            by: [],
            filter: dateFilter,
          },
        },
      }),
    })
    if (res?.ok) {
      const data = await res.json()
      const dates: string[] = data?.data?.attributes?.dates ?? []
      const rows = resultRows(data)
      for (const row of rows) {
        const values: unknown[] = row?.measurements?.count ?? []
        for (let i = 0; i < dates.length; i++) {
          const dateKey = dates[i]?.slice(0, 10)
          if (dateKey) {
            unsubsByDay.set(dateKey, (unsubsByDay.get(dateKey) || 0) + numberFromValue(values[i]))
          }
        }
      }
    }
  }

  // Collect all unique dates
  const allDates = new Set([
    ...revenueByDay.keys(),
    ...attributedByDay.keys(),
    ...subscribersByDay.keys(),
    ...unsubsByDay.keys(),
  ])

  if (allDates.size === 0) {
    // No data for this month — still mark as success
    return { success: true }
  }

  // Upsert daily metrics
  const rows = Array.from(allDates).map((date) => ({
    connection_id: connectionId,
    date,
    total_revenue: revenueByDay.get(date) || 0,
    attributed_revenue: attributedByDay.get(date) || 0,
    subscribers: subscribersByDay.get(date) || 0,
    unsubscribes: unsubsByDay.get(date) || 0,
  }))

  const { error } = await supabase
    .from('analytics_daily_metrics')
    .upsert(rows, { onConflict: 'connection_id,date' })

  if (error) {
    return { success: false, error: `DB upsert failed: ${error.message}` }
  }

  return { success: true }
}

async function syncCampaigns(
  supabase: SupabaseClient,
  connectionId: string,
  month: string,
  metricIds: AnalyticsMetricIds
): Promise<SyncStepResult> {
  if (!metricIds.placedOrderMetricId) {
    return { success: true }
  }

  const start = monthStart(month)
  const startDt = toKlaviyoDatetime(start, false)
  const end = monthEnd(month)
  const endDt = toKlaviyoDatetime(end, true)
  const monthKey = start // YYYY-MM-01

  let res: Response | null = null
  let rateLimitBody = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await klaviyoFetch(supabase, connectionId, '/api/campaign-values-reports/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'campaign-values-report',
          attributes: {
            timeframe: { start: startDt, end: endDt },
            conversion_metric_id: metricIds.placedOrderMetricId,
            statistics: ['open_rate', 'click_rate', 'conversion_value'],
          },
        },
      }),
    })

    if (!res) break
    if (res.status !== 429) break

    rateLimitBody = await res.text().catch(() => '')
    if (attempt < 2) {
      await sleep(rateLimitWaitMs(rateLimitBody, res.headers.get('retry-after')))
    }
  }

  if (!res) return { success: false, error: 'Klaviyo API returned null (token issue)' }
  if (res.status === 429) {
    const body = rateLimitBody || await res.text()
    return { success: false, error: `Rate limited after retries: ${body}` }
  }
  if (!res.ok) {
    const body = await res.text()
    return { success: false, error: `campaign-values-reports: ${res.status} ${body}` }
  }

  const data = await res.json()
  const rows = resultRows(data)
  const included = includedNameMap(data)

  // Parse campaigns
  const campaigns = rows.map((row: any) => {
    const cId = campaignIdFromRow(row)
    const msgId = campaignMessageIdFromRow(row)
    const rowName = campaignNameFromRow(row)
    const resolvedName = rowName !== 'Unknown'
      ? rowName
      : (included.get(cId) || included.get(msgId) || 'Unknown')
    return {
      primaryId: cId || msgId,
      name: resolvedName,
      revenue: numberFromValue(statValue(row, 'conversion_value')),
      openRate: numberFromValue(statValue(row, 'open_rate')),
      clickRate: numberFromValue(statValue(row, 'click_rate')),
      deliveredCount: numberFromValue(
        statValue(row, 'recipients_count')
        ?? statValue(row, 'recipients')
        ?? row?.recipients_count
        ?? row?.recipients
      ),
    }
  })

  const aggregatedCampaigns = aggregateRowsByPrimaryId(campaigns)

  // Sort by revenue (store full monthly snapshot, not top-N only)
  const sorted = aggregatedCampaigns
    .filter((c: any) => c.primaryId)
    .sort((a: any, b: any) => b.revenue - a.revenue)

  // Hydrate unknown names (limit to 10 to stay within time budget)
  const unknowns = sorted.filter((c: any) => c.name === 'Unknown').slice(0, 10)
  for (const campaign of unknowns) {
    const name = await hydrateOneCampaignName(supabase, connectionId, campaign.primaryId)
    if (name) campaign.name = name
    else campaign.name = `Campaign ${campaign.primaryId}`
  }

  // Replace this month's campaign snapshot entirely to avoid stale rows.
  const { error: deleteError } = await supabase
    .from('analytics_monthly_campaigns')
    .delete()
    .eq('connection_id', connectionId)
    .eq('month', monthKey)

  if (deleteError) {
    return { success: false, error: `DB delete failed: ${deleteError.message}` }
  }

  if (sorted.length > 0) {
    const dbRows = sorted.map((c: any) => ({
      connection_id: connectionId,
      month: monthKey,
      campaign_id: c.primaryId,
      campaign_name: c.name,
      revenue: c.revenue,
      open_rate: c.openRate,
      click_rate: c.clickRate,
      delivered_count: c.deliveredCount,
    }))

    const { error } = await supabase
      .from('analytics_monthly_campaigns')
      .insert(dbRows)

    if (error) {
      return { success: false, error: `DB insert failed: ${error.message}` }
    }
  }

  return { success: true }
}

async function syncFlows(
  supabase: SupabaseClient,
  connectionId: string,
  month: string,
  metricIds: AnalyticsMetricIds
): Promise<SyncStepResult> {
  if (!metricIds.placedOrderMetricId) {
    return { success: true }
  }

  const start = monthStart(month)
  const end = monthEnd(month)
  const startDt = toKlaviyoDatetime(start, false)
  const endDt = toKlaviyoDatetime(end, true)
  const monthKey = start

  let res: Response | null = null
  let rateLimitBody = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await klaviyoFetch(supabase, connectionId, '/api/flow-values-reports/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'flow-values-report',
          attributes: {
            timeframe: { start: startDt, end: endDt },
            conversion_metric_id: metricIds.placedOrderMetricId,
            statistics: ['open_rate', 'click_rate', 'conversion_value'],
          },
        },
      }),
    })

    if (!res) break
    if (res.status !== 429) break

    rateLimitBody = await res.text().catch(() => '')
    if (attempt < 2) {
      await sleep(rateLimitWaitMs(rateLimitBody, res.headers.get('retry-after')))
    }
  }

  if (!res) return { success: false, error: 'Klaviyo API returned null (token issue)' }
  if (res.status === 429) {
    const body = rateLimitBody || await res.text()
    return { success: false, error: `Rate limited after retries: ${body}` }
  }
  if (!res.ok) {
    const body = await res.text()
    return { success: false, error: `flow-values-reports: ${res.status} ${body}` }
  }

  const data = await res.json()
  const rows = resultRows(data)
  const included = includedNameMap(data)

  const flows = rows.map((row: any) => {
    const fId = flowIdFromRow(row)
    const msgId = attributedMessageIdFromRow(row)
    const rowName = flowNameFromRow(row)
    const resolvedName = rowName !== 'Unknown'
      ? rowName
      : (included.get(fId) || included.get(msgId) || 'Unknown')
    return {
      primaryId: fId || msgId,
      name: resolvedName,
      revenue: numberFromValue(statValue(row, 'conversion_value')),
      openRate: numberFromValue(statValue(row, 'open_rate')),
      clickRate: numberFromValue(statValue(row, 'click_rate')),
      deliveredCount: numberFromValue(
        statValue(row, 'recipients_count')
        ?? statValue(row, 'recipients')
        ?? row?.recipients_count
        ?? row?.recipients
      ),
    }
  })

  const aggregatedFlows = aggregateRowsByPrimaryId(flows)

  const rankedFlows = aggregatedFlows
    .filter((f: any) => f.primaryId)
    .sort((a: any, b: any) => b.revenue - a.revenue)

  // Hydrate unknown names where possible.
  const unknowns = rankedFlows.filter((f: any) => f.name === 'Unknown').slice(0, 10)
  for (const flow of unknowns) {
    const name = await hydrateOneFlowName(supabase, connectionId, flow.primaryId)
    if (name) flow.name = name
    else flow.name = `Flow ${flow.primaryId}`
  }

  // Replace this month's monthly flow snapshot entirely to avoid stale rows.
  const { error: deleteMonthlyError } = await supabase
    .from('analytics_monthly_flows')
    .delete()
    .eq('connection_id', connectionId)
    .eq('month', monthKey)

  if (deleteMonthlyError) {
    return { success: false, error: `DB delete monthly flows failed: ${deleteMonthlyError.message}` }
  }

  if (rankedFlows.length > 0) {
    const dbRows = rankedFlows.map((f) => ({
      connection_id: connectionId,
      month: monthKey,
      flow_id: f.primaryId,
      flow_name: f.name,
      revenue: f.revenue,
      open_rate: f.openRate,
      click_rate: f.clickRate,
      delivered_count: f.deliveredCount,
    }))

    const { error } = await supabase
      .from('analytics_monthly_flows')
      .insert(dbRows)

    if (error) {
      return { success: false, error: `DB insert failed: ${error.message}` }
    }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Main sync step dispatcher
// ---------------------------------------------------------------------------

export async function syncStep(
  supabase: SupabaseClient,
  connectionId: string,
  month: string,
  step: AnalyticsSyncStep
): Promise<SyncStepResult> {
  const metricIds = await discoverMetricIds(supabase, connectionId)

  switch (step) {
    case 'daily-metrics':
      return syncDailyMetrics(supabase, connectionId, month, metricIds)
    case 'campaigns':
      return syncCampaigns(supabase, connectionId, month, metricIds)
    case 'flows':
      return syncFlows(supabase, connectionId, month, metricIds)
    default:
      return { success: false, error: `Unknown step: ${step}` }
  }
}

// ---------------------------------------------------------------------------
// Job queue helpers
// ---------------------------------------------------------------------------

const SYNC_STEPS: AnalyticsSyncStep[] = ['daily-metrics', 'campaigns', 'flows']

export async function createSyncJobs(
  supabase: SupabaseClient,
  connectionId: string,
  months: string[],
  triggeredBy: AnalyticsSyncTrigger
): Promise<void> {
  const jobs = months.flatMap((month) =>
    SYNC_STEPS.map((step) => ({
      connection_id: connectionId,
      month: monthStart(month),
      step,
      status: 'pending' as const,
      triggered_by: triggeredBy,
    }))
  )

  await supabase
    .from('analytics_sync_jobs')
    .upsert(jobs, {
      onConflict: 'connection_id,month,step',
      ignoreDuplicates: false,
    })
}

export async function getNextPendingJob(
  supabase: SupabaseClient,
  connectionId?: string
): Promise<{
  id: string
  connection_id: string
  month: string
  step: AnalyticsSyncStep
} | null> {
  let query = supabase
    .from('analytics_sync_jobs')
    .select('id, connection_id, month, step')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (connectionId) {
    query = query.eq('connection_id', connectionId)
  }

  const { data } = await query.single()
  return data as any ?? null
}

export async function markJobRunning(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase
    .from('analytics_sync_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function markJobCompleted(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase
    .from('analytics_sync_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function markJobFailed(supabase: SupabaseClient, jobId: string, error: string): Promise<void> {
  await supabase
    .from('analytics_sync_jobs')
    .update({ status: 'failed', error_message: error, completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

/** Check if all 3 steps for a given month are completed */
export async function isMonthFullySynced(
  supabase: SupabaseClient,
  connectionId: string,
  month: string
): Promise<boolean> {
  const { data } = await supabase
    .from('analytics_sync_jobs')
    .select('step, status')
    .eq('connection_id', connectionId)
    .eq('month', monthStart(month))

  if (!data || data.length < 3) return false
  return data.every((job) => job.status === 'completed')
}

/** Update analytics_synced_through on the connection after sync */
export async function updateSyncedThrough(
  supabase: SupabaseClient,
  connectionId: string
): Promise<void> {
  // Find the earliest month that's fully synced
  const { data: completedJobs } = await supabase
    .from('analytics_sync_jobs')
    .select('month, status')
    .eq('connection_id', connectionId)
    .order('month', { ascending: true })

  if (!completedJobs || completedJobs.length === 0) return

  // Group by month
  const byMonth = new Map<string, string[]>()
  for (const job of completedJobs) {
    const m = job.month
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m)!.push(job.status)
  }

  // Find the earliest fully-synced month
  let earliestSynced: string | null = null
  for (const [month, statuses] of byMonth) {
    if (statuses.length >= 3 && statuses.every((s) => s === 'completed')) {
      if (!earliestSynced || month < earliestSynced) {
        earliestSynced = month
      }
    }
  }

  if (earliestSynced) {
    await supabase
      .from('klaviyo_connections')
      .update({ analytics_synced_through: earliestSynced })
      .eq('id', connectionId)
  }
}
