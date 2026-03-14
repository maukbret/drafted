import { SupabaseClient } from '@supabase/supabase-js'
import { klaviyoFetch } from '@/lib/klaviyo'
import { KlaviyoAnalyticsCampaign, KlaviyoAnalyticsData, KlaviyoAnalyticsFlow } from '@/types/database'

const METRIC_CACHE_TTL_MS = 15 * 60 * 1000
const REPORTING_GAP_MS = 1200
const NAME_CACHE_TTL_MS = 60 * 60 * 1000
const ACTIVE_PROFILES_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_NAME_HYDRATIONS_PER_REPORT = 10
const MANAGED_SEGMENT_NAME = 'Drafted Reporting Segment'
const MANAGED_SEGMENT_COUNT_RETRY_ATTEMPTS = 4
const MANAGED_SEGMENT_COUNT_RETRY_DELAY_MS = 1500
const MANAGED_SEGMENT_ID_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const MANAGED_SEGMENT_WARMUP_MS = 2 * 60 * 1000
const metricCache = new Map<string, { ids: AnalyticsMetricIds; expiresAt: number }>()
const campaignNameCache = new Map<string, { name: string; expiresAt: number }>()
const flowNameCache = new Map<string, { name: string; expiresAt: number }>()
const activeProfilesCache = new Map<string, { count: number; expiresAt: number }>()
const managedSegmentIdCache = new Map<string, { segmentId: string; expiresAt: number }>()
const managedSegmentEnsureLocks = new Map<string, Promise<string>>()
const managedSegmentWarmupUntil = new Map<string, number>()

export type AnalyticsErrorCode = 'managed_segment_scope_required' | 'managed_segment_unavailable'

export class AnalyticsFetchError extends Error {
  code: AnalyticsErrorCode
  actionUrl?: string

  constructor(code: AnalyticsErrorCode, message: string, actionUrl?: string) {
    super(message)
    this.name = 'AnalyticsFetchError'
    this.code = code
    this.actionUrl = actionUrl
  }
}

/** Convert a YYYY-MM-DD date string to an ISO 8601 datetime Klaviyo expects */
export function toKlaviyoDatetime(dateStr: string, endOfDay = false): string {
  const time = endOfDay ? 'T23:59:59+00:00' : 'T00:00:00+00:00'
  return `${dateStr}${time}`
}

/** Returns the day after a YYYY-MM-DD date as an ISO 8601 datetime. */
function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}T00:00:00+00:00`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

  return Object.values(record).reduce<number>((sum, item) => sum + numberFromValue(item), 0)
}

function rateLimitWaitMs(body: string, retryAfterHeader: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000) + 500
  }

  const match = body.match(/available in\s+(\d+)\s+seconds?/i)
  if (match) {
    return Number(match[1]) * 1000 + 500
  }

  return 3000
}

async function klaviyoFetchWithRetry(
  supabase: SupabaseClient,
  connectionId: string,
  endpoint: string,
  options?: RequestInit,
  attempts = 3
): Promise<Response | null> {
  let response: Response | null = null
  let rateBody = ''

  for (let attempt = 0; attempt < attempts; attempt++) {
    response = await klaviyoFetch(supabase, connectionId, endpoint, options)
    if (!response) return null
    if (response.status !== 429) return response

    rateBody = await response.text().catch(() => '')
    if (attempt < attempts - 1) {
      await sleep(rateLimitWaitMs(rateBody, response.headers.get('retry-after')))
    }
  }

  return response
}

export interface AnalyticsMetricIds {
  placedOrderMetricId: string | null
  subscribedMetricId: string | null
  unsubscribedMetricId: string | null
  openedEmailMetricId: string | null
  clickedEmailMetricId: string | null
  receivedEmailMetricId: string | null
}

function findMetricsFromList(allMetrics: Array<{ id: string; name: string }>): AnalyticsMetricIds {
  const allLower = allMetrics.map((m) => ({ ...m, lower: m.name.toLowerCase().trim() }))

  const findExact = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const match = allLower.find((m) => m.lower === candidate.toLowerCase().trim())
      if (match) return match.id
    }
    return null
  }

  const findIncludes = (candidates: string[], excludes: string[] = []): string | null => {
    for (const candidate of candidates) {
      const needle = candidate.toLowerCase().trim()
      const match = allLower.find((m) => {
        if (!m.lower.includes(needle)) return false
        for (const exclude of excludes) {
          if (m.lower.includes(exclude)) return false
        }
        return true
      })
      if (match) return match.id
    }
    return null
  }

  return {
    placedOrderMetricId: findExact(['Placed Order']) ?? findIncludes(['placed order']),
    subscribedMetricId:
      findExact(['Subscribed to Email Marketing', 'Subscribed to List'])
      ?? findIncludes(['subscribed to email marketing', 'subscribed to list', 'subscribed'], ['sms', 'push']),
    unsubscribedMetricId:
      findExact(['Unsubscribed from Email Marketing', 'Unsubscribed'])
      ?? findIncludes(['unsubscribed from email marketing', 'unsubscribed', 'unsubscribe'], ['sms', 'push', 'clicked'])
      ?? findExact(['Clicked email to unsubscribe'])
      ?? findIncludes(['clicked email to unsubscribe'], ['sms', 'push']),
    openedEmailMetricId:
      findExact(['Opened Email']) ?? findIncludes(['opened email'], ['sms', 'push']),
    clickedEmailMetricId:
      findExact(['Clicked Email']) ?? findIncludes(['clicked email'], ['sms', 'push', 'unsubscribe']),
    receivedEmailMetricId:
      findExact(['Received Email']) ?? findIncludes(['received email'], ['sms', 'push']),
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
    const res = await klaviyoFetchWithRetry(supabase, connectionId, nextUrl)

    if (!res) {
      console.error('[Analytics] fetchAllMetrics: null response (token issue?)')
      break
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[Analytics] fetchAllMetrics: ${res.status}`, body)
      break
    }

    const data = await res.json()
    const page: any[] = Array.isArray(data?.data) ? data.data : []
    for (const m of page) {
      metrics.push({ id: m.id, name: m.attributes?.name || '' })
    }

    nextUrl = data?.links?.next || null
    pageCount++
  }

  return metrics
}

export async function discoverMetricIds(
  supabase: SupabaseClient,
  connectionId: string
): Promise<AnalyticsMetricIds> {
  const now = Date.now()
  const cached = metricCache.get(connectionId)
  if (cached && cached.expiresAt > now) return cached.ids

  const allMetrics = await fetchAllMetrics(supabase, connectionId)
  const metricIds = findMetricsFromList(allMetrics)
  const metricNameById = new Map(allMetrics.map((metric) => [metric.id, metric.name]))

  console.log('[Analytics] Resolved metric IDs', {
    connectionId,
    placedOrder: metricNameById.get(metricIds.placedOrderMetricId || '') || null,
    subscribed: metricNameById.get(metricIds.subscribedMetricId || '') || null,
    unsubscribed: metricNameById.get(metricIds.unsubscribedMetricId || '') || null,
    openedEmail: metricNameById.get(metricIds.openedEmailMetricId || '') || null,
    clickedEmail: metricNameById.get(metricIds.clickedEmailMetricId || '') || null,
    receivedEmail: metricNameById.get(metricIds.receivedEmailMetricId || '') || null,
  })

  metricCache.set(connectionId, {
    ids: metricIds,
    expiresAt: now + METRIC_CACHE_TTL_MS,
  })

  return metricIds
}

interface RevenueResult {
  totalRevenue: number
}

interface MetricCountResult {
  count: number | null
}

interface CampaignResult {
  campaigns: KlaviyoAnalyticsCampaign[]
  attributedRevenue: number
}

interface FlowResult {
  flows: KlaviyoAnalyticsFlow[]
  flowAttributedRevenue: number
}

function finiteNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizedCountOrNull(value: unknown): number | null {
  const parsed = finiteNumberOrNull(value)
  if (parsed === null) return null
  return Math.max(0, Math.round(parsed))
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateToYmd(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return formatYmd(parsed)
}

function extractAccountCreatedDate(payload: any): string | null {
  const account = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  const attrs = account?.attributes ?? {}

  const candidates: unknown[] = [
    attrs?.created,
    attrs?.created_at,
    attrs?.['created-at'],
    attrs?.createdAt,
    account?.created,
    account?.created_at,
    account?.createdAt,
  ]

  for (const candidate of candidates) {
    const ymd = parseDateToYmd(candidate)
    if (ymd) return ymd
  }

  return null
}

function buildDateWindows(
  startYmd: string,
  endYmd: string,
  maxDaysPerWindowInclusive = 364
): Array<{ start: string; end: string }> {
  const start = new Date(`${startYmd}T00:00:00Z`)
  const end = new Date(`${endYmd}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const windows: Array<{ start: string; end: string }> = []
  const cursor = new Date(start)

  while (cursor <= end) {
    const windowStart = new Date(cursor)
    const windowEnd = new Date(cursor)
    windowEnd.setUTCDate(windowEnd.getUTCDate() + maxDaysPerWindowInclusive)
    if (windowEnd > end) {
      windowEnd.setTime(end.getTime())
    }

    windows.push({
      start: formatYmd(windowStart),
      end: formatYmd(windowEnd),
    })

    cursor.setTime(windowEnd.getTime())
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return windows
}

interface NumericPathCandidate {
  path: string
  value: number
}

function collectNumericPathCandidates(
  value: unknown,
  pathParts: string[],
  out: NumericPathCandidate[],
  depth = 0
) {
  if (depth > 6 || out.length > 400) return

  const normalized = normalizedCountOrNull(value)
  if (normalized !== null) {
    out.push({
      path: pathParts.join('.').toLowerCase(),
      value: normalized,
    })
    return
  }

  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    const slice = value.slice(0, 20)
    for (let i = 0; i < slice.length; i++) {
      collectNumericPathCandidates(slice[i], [...pathParts, String(i)], out, depth + 1)
    }
    return
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 80)
  for (const [key, child] of entries) {
    collectNumericPathCandidates(child, [...pathParts, key], out, depth + 1)
  }
}

function scoreProfileCountCandidate(path: string, value: number, preferEmail: boolean): number {
  let score = 0

  if (path.includes('count')) score += 3
  if (path.includes('profile')) score += 6
  if (path.includes('subscriber')) score += 5
  if (path.includes('active')) score += 5
  if (path.includes('subscribed')) score += 4
  if (path.includes('total')) score += 2

  if (path.includes('email')) score += preferEmail ? 8 : 2
  if (path.includes('channel')) score += 2

  if (preferEmail && !path.includes('email')) score -= 12
  if (preferEmail && (path.includes('sms') || path.includes('push'))) score -= 10

  if (path.includes('id') || path.includes('version') || path.includes('rate') || path.includes('limit')) {
    score -= 10
  }

  if (value === 0) score -= 2
  if (value > 100_000_000) score -= 15

  return score
}

function heuristicProfileCountFromObject(value: unknown, preferEmail: boolean): number | null {
  const candidates: NumericPathCandidate[] = []
  collectNumericPathCandidates(value, [], candidates)
  if (candidates.length === 0) return null

  let best: NumericPathCandidate | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const candidate of candidates) {
    const score = scoreProfileCountCandidate(candidate.path, candidate.value, preferEmail)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  if (!best || bestScore < 8) return null
  return best.value
}

function extractAccountLevelProfileCount(payload: any): number | null {
  const account = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  const attrs = account?.attributes ?? {}
  const contact = attrs?.contact_information ?? {}

  const candidates: unknown[] = [
    attrs?.active_profile_count,
    attrs?.['active_profile_count'],
    attrs?.['active-profile-count'],
    attrs?.active_profiles,
    attrs?.['active_profiles'],
    attrs?.['active-profiles'],
    attrs?.total_active_profiles,
    attrs?.['total_active_profiles'],
    attrs?.['total-active-profiles'],
    attrs?.profile_count,
    attrs?.['profile_count'],
    attrs?.['profile-count'],
    attrs?.total_profiles,
    attrs?.['total_profiles'],
    attrs?.['total-profiles'],
    attrs?.subscribed_profile_count,
    attrs?.['subscribed_profile_count'],
    attrs?.['subscribed-profile-count'],
    attrs?.email_subscribers,
    attrs?.['email_subscribers'],
    attrs?.['email-subscribers'],
    contact?.active_profile_count,
    contact?.['active_profile_count'],
    contact?.['active-profile-count'],
    contact?.active_profiles,
    contact?.['active_profiles'],
    contact?.['active-profiles'],
    contact?.total_active_profiles,
    contact?.['total_active_profiles'],
    contact?.['total-active-profiles'],
    contact?.profile_count,
    contact?.['profile_count'],
    contact?.['profile-count'],
    contact?.total_profiles,
    contact?.['total_profiles'],
    contact?.['total-profiles'],
    contact?.subscribed_profile_count,
    contact?.['subscribed_profile_count'],
    contact?.['subscribed-profile-count'],
    contact?.email_subscribers,
    contact?.['email_subscribers'],
    contact?.['email-subscribers'],
  ]

  for (const candidate of candidates) {
    const parsed = normalizedCountOrNull(candidate)
    if (parsed !== null) return parsed
  }

  const heuristic = heuristicProfileCountFromObject({ attributes: attrs, contact }, false)
  if (heuristic !== null) return heuristic

  return null
}

function extractAccountEmailProfileCount(payload: any): number | null {
  const account = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  const attrs = account?.attributes ?? {}
  const contact = attrs?.contact_information ?? {}

  const candidates: unknown[] = [
    attrs?.channel_profile_counts?.email?.active_profile_count,
    attrs?.channel_profile_counts?.email?.active_profiles,
    attrs?.channel_profile_counts?.email?.profile_count,
    attrs?.channel_profile_counts?.email?.subscribed_profile_count,
    attrs?.channelProfileCounts?.email?.activeProfileCount,
    attrs?.channelProfileCounts?.email?.activeProfiles,
    attrs?.profile_counts?.email?.active,
    attrs?.profile_counts?.email?.active_profile_count,
    attrs?.profile_counts?.email?.active_profiles,
    attrs?.profileCounts?.email?.active,
    attrs?.profileCounts?.email?.activeProfileCount,
    attrs?.profileCounts?.email?.activeProfiles,
    attrs?.email?.active_profile_count,
    attrs?.email?.active_profiles,
    attrs?.email?.profile_count,
    attrs?.statistics?.email?.active_profile_count,
    attrs?.statistics?.email?.active_profiles,
    attrs?.statistics?.email?.profile_count,
    contact?.email?.active_profile_count,
    contact?.email?.active_profiles,
    contact?.email?.profile_count,
    contact?.channels?.email?.active_profile_count,
    contact?.channels?.email?.active_profiles,
    contact?.channels?.email?.profile_count,
  ]

  for (const candidate of candidates) {
    const parsed = normalizedCountOrNull(candidate)
    if (parsed !== null) return parsed
  }

  const heuristic = heuristicProfileCountFromObject({ attributes: attrs, contact }, true)
  if (heuristic !== null) return heuristic

  return null
}

function extractSegmentProfileCount(segment: any): number | null {
  const attrs = segment?.attributes ?? {}
  const candidates: unknown[] = [
    attrs?.profile_count,
    attrs?.['profile_count'],
    attrs?.['profile-count'],
    attrs?.profileCount,
    attrs?.member_count,
    attrs?.['member_count'],
    attrs?.['member-count'],
    attrs?.memberCount,
    attrs?.subscriber_count,
    attrs?.['subscriber_count'],
    attrs?.['subscriber-count'],
    attrs?.total_profiles,
    attrs?.['total_profiles'],
    attrs?.['total-profiles'],
    attrs?.total_members,
    attrs?.['total_members'],
    attrs?.['total-members'],
  ]

  for (const candidate of candidates) {
    const parsed = normalizedCountOrNull(candidate)
    if (parsed !== null) return parsed
  }
  return null
}

function cacheActiveProfileCount(connectionId: string, count: number, now: number): number {
  if (count <= 0) {
    // Avoid stale zero-values during Klaviyo segment warmup.
    activeProfilesCache.delete(connectionId)
    return count
  }

  activeProfilesCache.set(connectionId, {
    count,
    expiresAt: now + ACTIVE_PROFILES_CACHE_TTL_MS,
  })
  return count
}

function getCachedManagedSegmentId(connectionId: string): string | null {
  const cached = managedSegmentIdCache.get(connectionId)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    managedSegmentIdCache.delete(connectionId)
    return null
  }
  return cached.segmentId
}

function setCachedManagedSegmentId(connectionId: string, segmentId: string) {
  managedSegmentIdCache.set(connectionId, {
    segmentId,
    expiresAt: Date.now() + MANAGED_SEGMENT_ID_CACHE_TTL_MS,
  })
}

function parseSegmentCreatedMs(segment: any): number {
  const createdRaw = firstString(segment?.attributes?.created, segment?.created)
  if (!createdRaw) return Number.MAX_SAFE_INTEGER
  const parsed = new Date(createdRaw)
  const ms = parsed.getTime()
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER
}

async function findManagedSegmentIdByName(
  supabase: SupabaseClient,
  connectionId: string
): Promise<string | null> {
  let nextUrl: string | null = '/api/segments'
  let pageCount = 0
  const maxPages = 20
  const candidates: Array<{ id: string; createdMs: number }> = []

  while (nextUrl && pageCount < maxPages) {
    const res = await klaviyoFetchWithRetry(supabase, connectionId, nextUrl, undefined, 2)
    if (!res?.ok) {
      const body = res ? await res.text().catch(() => '') : 'null response'
      if (res?.status === 403) {
        throw new AnalyticsFetchError(
          'managed_segment_scope_required',
          'This Klaviyo connection is missing segment read access. Delete and reconnect this account from Connections.',
          '/connections'
        )
      }
      console.warn('[Analytics] Failed to list segments while resolving managed reporting segment', {
        connectionId,
        status: res?.status ?? 'null',
        body,
      })
      return null
    }

    const payload = await res.json().catch(() => null)
    const rows: any[] = Array.isArray(payload?.data) ? payload.data : []

    for (const row of rows) {
      const id = firstString(row?.id)
      const name = firstString(row?.attributes?.name)
      if (!id || name !== MANAGED_SEGMENT_NAME) continue
      candidates.push({
        id,
        createdMs: parseSegmentCreatedMs(row),
      })
    }

    nextUrl = payload?.links?.next || null
    pageCount += 1
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.createdMs - b.createdMs)
  return candidates[0].id
}

function managedSegmentDefinitionPayload() {
  return {
    condition_groups: [
      {
        conditions: [
          {
            type: 'profile-marketing-consent',
            consent: {
              channel: 'email',
              can_receive_marketing: true,
              consent_status: {
                subscription: 'any',
              },
            },
          },
        ],
      },
    ],
  }
}

async function createManagedSegment(
  supabase: SupabaseClient,
  connectionId: string
): Promise<string | null> {
  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/segments/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'segment',
        attributes: {
          name: MANAGED_SEGMENT_NAME,
          definition: managedSegmentDefinitionPayload(),
          is_starred: false,
        },
      },
    }),
  }, 2)

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    if (res?.status === 403) {
      throw new AnalyticsFetchError(
        'managed_segment_scope_required',
        'This Klaviyo connection cannot create the required reporting segment. Delete and reconnect this account from Connections.',
        '/connections'
      )
    }
    console.warn('[Analytics] Failed to auto-create managed reporting segment', {
      connectionId,
      status: res?.status ?? 'null',
      body,
    })
    return null
  }

  const payload = await res.json().catch(() => null)
  const segmentId = firstString(payload?.data?.id)
  if (!segmentId) {
    console.warn('[Analytics] Managed reporting segment created without id in response', { connectionId })
    return null
  }

  return segmentId
}

async function ensureManagedSegmentId(
  supabase: SupabaseClient,
  connectionId: string,
  canWriteSegments: boolean
): Promise<string> {
  const cached = getCachedManagedSegmentId(connectionId)
  if (cached) return cached

  const existingLock = managedSegmentEnsureLocks.get(connectionId)
  if (existingLock) return existingLock

  const ensurePromise = (async () => {
    const existingId = await findManagedSegmentIdByName(supabase, connectionId)
    if (existingId) {
      setCachedManagedSegmentId(connectionId, existingId)
      return existingId
    }

    if (!canWriteSegments) {
      throw new AnalyticsFetchError(
        'managed_segment_scope_required',
        'This Klaviyo connection needs segment write permissions to prepare reporting. Delete and reconnect this account from Connections.',
        '/connections'
      )
    }

    const createdId = await createManagedSegment(supabase, connectionId)
    if (!createdId) {
      throw new AnalyticsFetchError(
        'managed_segment_unavailable',
        `Drafted could not prepare "${MANAGED_SEGMENT_NAME}" in Klaviyo. Please try reconnecting this account from Connections.`,
        '/connections'
      )
    }

    setCachedManagedSegmentId(connectionId, createdId)
    managedSegmentWarmupUntil.set(connectionId, Date.now() + MANAGED_SEGMENT_WARMUP_MS)
    return createdId
  })()

  managedSegmentEnsureLocks.set(connectionId, ensurePromise)
  try {
    return await ensurePromise
  } finally {
    managedSegmentEnsureLocks.delete(connectionId)
  }
}

async function fetchManagedSegmentProfileCount(
  supabase: SupabaseClient,
  connectionId: string,
  segmentId: string,
  retryZeroCounts: boolean
): Promise<number | null> {
  const encodedSegmentId = encodeURIComponent(segmentId)
  const endpoints = [
    `/api/segments/${encodedSegmentId}/?additional-fields[segment]=profile_count`,
    `/api/segments/${encodedSegmentId}/`,
  ]

  for (let attempt = 0; attempt < MANAGED_SEGMENT_COUNT_RETRY_ATTEMPTS; attempt++) {
    for (const endpoint of endpoints) {
      const res = await klaviyoFetchWithRetry(supabase, connectionId, endpoint, undefined, 2)
      if (!res?.ok) {
        const body = res ? await res.text().catch(() => '') : 'null response'
        if (res?.status === 403) {
          throw new AnalyticsFetchError(
            'managed_segment_scope_required',
            'This Klaviyo connection is missing segment read access for reporting. Delete and reconnect this account from Connections.',
            '/connections'
          )
        }
        console.warn('[Analytics] Managed segment profile_count call failed', {
          connectionId,
          segmentId,
          endpoint,
          status: res?.status ?? 'null',
          body,
        })
        continue
      }

      const payload = await res.json().catch(() => null)
      const count = extractSegmentProfileCount(payload?.data)
      if (count !== null) {
        if (count > 0) {
          managedSegmentWarmupUntil.delete(connectionId)
          return count
        }

        if (!retryZeroCounts || attempt >= MANAGED_SEGMENT_COUNT_RETRY_ATTEMPTS - 1) {
          return 0
        }

        await sleep(MANAGED_SEGMENT_COUNT_RETRY_DELAY_MS)
        continue
      }

      const isProcessing = payload?.data?.attributes?.is_processing === true
      if (isProcessing && attempt < MANAGED_SEGMENT_COUNT_RETRY_ATTEMPTS - 1) {
        await sleep(MANAGED_SEGMENT_COUNT_RETRY_DELAY_MS)
        continue
      }
    }
  }

  return null
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

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
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

function cacheKey(connectionId: string, id: string): string {
  return `${connectionId}:${id}`
}

function getCachedName(
  map: Map<string, { name: string; expiresAt: number }>,
  key: string
): string | null {
  const cached = map.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    map.delete(key)
    return null
  }
  return cached.name
}

function setCachedName(
  map: Map<string, { name: string; expiresAt: number }>,
  key: string,
  name: string
) {
  map.set(key, {
    name,
    expiresAt: Date.now() + NAME_CACHE_TTL_MS,
  })
}

function campaignIdFromRow(row: any): string {
  return firstString(
    row?.campaign_id, row?.campaignId, row?.campaign, row?.campaign?.id,
    row?.campaign?.data?.id, row?.relationships?.campaign?.data?.id,
    row?.dimensions?.['$campaign'], row?.dimension_values?.['$campaign'], row?.groupings?.['$campaign'],
    row?.dimensions?.['$attributed_campaign'], row?.dimension_values?.['$attributed_campaign'], row?.groupings?.['$attributed_campaign'],
    row?.dimensions?.campaign_id, row?.dimension_values?.campaign_id, row?.groupings?.campaign_id
  )
}

function campaignMessageIdFromRow(row: any): string {
  return firstString(
    row?.campaign_message_id, row?.campaignMessageId, row?.message_id, row?.messageId,
    row?.relationships?.campaign_message?.data?.id, row?.relationships?.message?.data?.id,
    row?.dimensions?.campaign_message_id, row?.dimension_values?.campaign_message_id, row?.groupings?.campaign_message_id,
    row?.id
  )
}

function campaignNameFromRow(row: any): string {
  return firstString(
    row?.campaign_name, row?.campaignName, row?.campaign_message_name, row?.campaignMessageName,
    row?.campaign?.name, row?.campaign?.attributes?.name,
    row?.dimensions?.campaign_name, row?.dimension_values?.campaign_name, row?.groupings?.campaign_name,
    row?.name
  ) || 'Unknown'
}

function flowIdFromRow(row: any): string {
  return firstString(
    row?.flow_id, row?.flowId, row?.flow, row?.flow?.id,
    row?.flow?.data?.id, row?.relationships?.flow?.data?.id,
    row?.dimensions?.['$flow'], row?.dimension_values?.['$flow'], row?.groupings?.['$flow'],
    row?.dimensions?.['$attributed_flow'], row?.dimension_values?.['$attributed_flow'], row?.groupings?.['$attributed_flow'],
    row?.dimensions?.flow_id, row?.dimension_values?.flow_id, row?.groupings?.flow_id
  )
}

function attributedMessageIdFromRow(row: any): string {
  return firstString(
    row?.message_id, row?.messageId, row?.id,
    row?.dimensions?.['$attributed_message'], row?.dimension_values?.['$attributed_message'], row?.groupings?.['$attributed_message'],
    row?.dimensions?.['$message'], row?.dimension_values?.['$message'], row?.groupings?.['$message'],
    row?.dimensions?.attributed_message_id, row?.dimension_values?.attributed_message_id, row?.groupings?.attributed_message_id
  )
}

function flowNameFromRow(row: any): string {
  return firstString(
    row?.flow_name, row?.flowName, row?.flow?.name, row?.flow?.attributes?.name,
    row?.dimensions?.flow_name, row?.dimension_values?.flow_name, row?.groupings?.flow_name,
    row?.name
  ) || 'Unknown'
}

interface RankedEntityRow {
  primaryId: string
  name: string
  revenue: number
  openRate: number
  clickRate: number
  deliveredCount: number
}

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

  return Array.from(byId.entries()).map(([primaryId, agg]) => ({
    primaryId,
    name: agg.name,
    revenue: agg.revenue,
    openRate: agg.deliveredCount > 0
      ? agg.openWeightedSum / agg.deliveredCount
      : (agg.unweightedCount > 0 ? agg.openUnweightedSum / agg.unweightedCount : 0),
    clickRate: agg.deliveredCount > 0
      ? agg.clickWeightedSum / agg.deliveredCount
      : (agg.unweightedCount > 0 ? agg.clickUnweightedSum / agg.unweightedCount : 0),
    deliveredCount: agg.deliveredCount,
  }))
}

async function hydrateCampaignName(
  supabase: SupabaseClient,
  connectionId: string,
  id: string
): Promise<string | null> {
  if (!id) return null

  const key = cacheKey(connectionId, id)
  const cached = getCachedName(campaignNameCache, key)
  if (cached) return cached

  const encodedId = encodeURIComponent(id)

  const campaignRes = await klaviyoFetchWithRetry(supabase, connectionId, `/api/campaigns/${encodedId}/`, undefined, 2)
  if (campaignRes?.ok) {
    const payload = await campaignRes.json().catch(() => null)
    const campaignName = firstString(payload?.data?.attributes?.name, payload?.data?.attributes?.label)
    if (campaignName) {
      setCachedName(campaignNameCache, key, campaignName)
      return campaignName
    }
  }

  const messageRes = await klaviyoFetchWithRetry(
    supabase,
    connectionId,
    `/api/campaign-messages/${encodedId}/?include=campaign`,
    undefined,
    2
  )
  if (messageRes?.ok) {
    const payload = await messageRes.json().catch(() => null)
    const included = includedNameMap(payload)
    const relatedCampaignId = firstString(payload?.data?.relationships?.campaign?.data?.id)
    const name = firstString(
      payload?.data?.attributes?.name,
      included.get(relatedCampaignId)
    )
    if (name) {
      setCachedName(campaignNameCache, key, name)
      return name
    }
  }

  return null
}

async function hydrateFlowName(
  supabase: SupabaseClient,
  connectionId: string,
  id: string
): Promise<string | null> {
  if (!id) return null

  const key = cacheKey(connectionId, id)
  const cached = getCachedName(flowNameCache, key)
  if (cached) return cached

  const encodedId = encodeURIComponent(id)

  const flowRes = await klaviyoFetchWithRetry(supabase, connectionId, `/api/flows/${encodedId}/`, undefined, 2)
  if (flowRes?.ok) {
    const payload = await flowRes.json().catch(() => null)
    const flowName = firstString(payload?.data?.attributes?.name, payload?.data?.attributes?.label)
    if (flowName) {
      setCachedName(flowNameCache, key, flowName)
      return flowName
    }
  }

  const flowMessageRes = await klaviyoFetchWithRetry(
    supabase,
    connectionId,
    `/api/flow-messages/${encodedId}/?include=flow`,
    undefined,
    2
  )
  if (flowMessageRes?.ok) {
    const payload = await flowMessageRes.json().catch(() => null)
    const included = includedNameMap(payload)
    const relatedFlowId = firstString(payload?.data?.relationships?.flow?.data?.id)
    const name = firstString(
      payload?.data?.attributes?.name,
      included.get(relatedFlowId)
    )
    if (name) {
      setCachedName(flowNameCache, key, name)
      return name
    }
  }

  const flowActionRes = await klaviyoFetchWithRetry(
    supabase,
    connectionId,
    `/api/flow-actions/${encodedId}/?include=flow`,
    undefined,
    2
  )
  if (flowActionRes?.ok) {
    const payload = await flowActionRes.json().catch(() => null)
    const included = includedNameMap(payload)
    const relatedFlowId = firstString(payload?.data?.relationships?.flow?.data?.id)
    const name = firstString(
      payload?.data?.attributes?.name,
      included.get(relatedFlowId)
    )
    if (name) {
      setCachedName(flowNameCache, key, name)
      return name
    }
  }

  return null
}

async function fetchRevenue(
  supabase: SupabaseClient,
  connectionId: string,
  metricId: string,
  dateFilter: string[]
): Promise<RevenueResult> {
  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/metric-aggregates/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: ['sum_value'],
          interval: 'day',
          by: [],
          filter: dateFilter,
        },
      },
    }),
  })

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    console.error('[Analytics] metric-aggregates revenue failed:', res?.status ?? 'null', body)
    return { totalRevenue: 0 }
  }

  const d = await res.json()
  const rows = resultRows(d)
  let total = 0
  for (const row of rows) {
    total += numberFromValue(row?.measurements?.sum_value)
  }

  return { totalRevenue: total }
}

async function fetchMetricCount(
  supabase: SupabaseClient,
  connectionId: string,
  metricId: string,
  dateFilter: string[],
  logPrefix: string
): Promise<MetricCountResult> {
  const attributes: Record<string, unknown> = {
    metric_id: metricId,
    measurements: ['count'],
    interval: 'day',
    by: [],
  }
  if (dateFilter.length > 0) {
    attributes.filter = dateFilter
  }

  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/metric-aggregates/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'metric-aggregate',
        attributes,
      },
    }),
  })

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    console.error(`[Analytics] metric-aggregates ${logPrefix} failed:`, res?.status ?? 'null', body)
    return { count: null }
  }

  const payload = await res.json()
  const rows = resultRows(payload)
  let count = 0
  for (const row of rows) {
    count += numberFromValue(row?.measurements?.count)
  }

  return { count }
}

async function fetchAllTimeNetEmailSubscribers(
  supabase: SupabaseClient,
  connectionId: string,
  subscribedMetricId: string | null | undefined,
  unsubscribedMetricId: string | null | undefined,
  startYmdHint: string | null
): Promise<number | null> {
  if (!subscribedMetricId || !unsubscribedMetricId) return null

  const endYmd = formatYmd(new Date())
  const startYmd = startYmdHint ?? '2000-01-01'
  const windows = buildDateWindows(startYmd, endYmd, 364)
  if (windows.length === 0) return null

  let subscribedTotal = 0
  let unsubscribedTotal = 0

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    const filter = [
      `greater-or-equal(datetime,${toKlaviyoDatetime(window.start, false)})`,
      `less-than(datetime,${dayAfter(window.end)})`,
    ]

    const subscribedResult = await fetchMetricCount(
      supabase,
      connectionId,
      subscribedMetricId,
      filter,
      `subscribed-all-time-${window.start}-${window.end}`
    )
    if (subscribedResult.count === null) return null
    subscribedTotal += subscribedResult.count

    const unsubscribedResult = await fetchMetricCount(
      supabase,
      connectionId,
      unsubscribedMetricId,
      filter,
      `unsubscribed-all-time-${window.start}-${window.end}`
    )
    if (unsubscribedResult.count === null) return null
    unsubscribedTotal += unsubscribedResult.count
  }

  return Math.max(0, subscribedTotal - unsubscribedTotal)
}

async function fetchActiveProfiles(
  supabase: SupabaseClient,
  connectionId: string,
  options: {
    allowSegmentsRead?: boolean
    allowSegmentsWrite?: boolean
  } = {}
): Promise<number | null> {
  const now = Date.now()
  const cached = activeProfilesCache.get(connectionId)
  if (cached && cached.expiresAt > now) {
    console.log('[Analytics] Using cached total profiles from managed reporting segment', {
      connectionId,
      count: cached.count,
    })
    return cached.count
  }
  const allowSegmentsRead = options.allowSegmentsRead !== false
  const allowSegmentsWrite = options.allowSegmentsWrite === true

  if (!allowSegmentsRead) {
    throw new AnalyticsFetchError(
      'managed_segment_scope_required',
      'This Klaviyo connection is missing segment permissions for list growth reporting. Delete and reconnect this account from Connections.',
      '/connections'
    )
  }

  const managedSegmentId = await ensureManagedSegmentId(
    supabase,
    connectionId,
    allowSegmentsWrite
  )

  const warmupUntil = managedSegmentWarmupUntil.get(connectionId) ?? 0
  const retryZeroCounts = Date.now() < warmupUntil

  const totalProfiles = await fetchManagedSegmentProfileCount(
    supabase,
    connectionId,
    managedSegmentId,
    retryZeroCounts
  )
  if (totalProfiles !== null) {
    console.log('[Analytics] Total profiles resolved via managed reporting segment', {
      connectionId,
      segmentId: managedSegmentId,
      count: totalProfiles,
    })
    return cacheActiveProfileCount(connectionId, totalProfiles, now)
  }

  throw new AnalyticsFetchError(
    'managed_segment_unavailable',
    `Drafted could not read profile count from "${MANAGED_SEGMENT_NAME}". Please reconnect this account from Connections and try again.`,
    '/connections'
  )
}

async function fetchCampaigns(
  supabase: SupabaseClient,
  connectionId: string,
  metricId: string,
  startDt: string,
  endDt: string
): Promise<CampaignResult> {
  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/campaign-values-reports/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          timeframe: { start: startDt, end: endDt },
          conversion_metric_id: metricId,
          statistics: ['open_rate', 'click_rate', 'conversion_value'],
        },
      },
    }),
  })

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    console.error('[Analytics] campaign-values-reports failed:', res?.status ?? 'null', body)
    return { campaigns: [], attributedRevenue: 0 }
  }

  const d = await res.json()
  const included = includedNameMap(d)
  const rows = resultRows(d)
  if (rows.length === 0) {
    console.log('[Analytics] campaign-values-reports returned no rows', { connectionId, startDt, endDt })
  }
  let attributedRevenue = 0

  const rawRows: RankedEntityRow[] = rows.map((row: any, index: number) => {
    const campaignId = campaignIdFromRow(row)
    const messageId = campaignMessageIdFromRow(row)
    const revenue = numberFromValue(statValue(row, 'conversion_value'))
    attributedRevenue += revenue

    const rowName = campaignNameFromRow(row)
    return {
      primaryId: campaignId || messageId || `campaign-row-${index}`,
      name: rowName !== 'Unknown'
        ? rowName
        : (included.get(campaignId) || included.get(messageId) || 'Unknown'),
      revenue,
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

  const campaigns: KlaviyoAnalyticsCampaign[] = aggregateRowsByPrimaryId(rawRows)
    .map((row) => ({
      id: row.primaryId,
      name: row.name,
      revenue: row.revenue,
      openRate: row.openRate,
      clickRate: row.clickRate,
      deliveredCount: row.deliveredCount,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const hydrateTargetCount = Math.min(MAX_NAME_HYDRATIONS_PER_REPORT, campaigns.length)
  for (let i = 0; i < hydrateTargetCount; i++) {
    const campaign = campaigns[i]
    if (campaign.name !== 'Unknown') continue
    const hydrated = await hydrateCampaignName(supabase, connectionId, campaign.id)
    if (hydrated) {
      campaigns[i] = { ...campaign, name: hydrated }
    } else if (campaign.id) {
      campaigns[i] = { ...campaign, name: `Campaign ${campaign.id}` }
    }
  }

  return { campaigns, attributedRevenue }
}

async function fetchFlows(
  supabase: SupabaseClient,
  connectionId: string,
  metricId: string,
  startDt: string,
  endDt: string
): Promise<FlowResult> {
  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/flow-values-reports/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'flow-values-report',
        attributes: {
          timeframe: { start: startDt, end: endDt },
          conversion_metric_id: metricId,
          statistics: ['open_rate', 'click_rate', 'conversion_value'],
        },
      },
    }),
  })

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    console.error('[Analytics] flow-values-reports failed:', res?.status ?? 'null', body)
    return { flows: [], flowAttributedRevenue: 0 }
  }

  const d = await res.json()
  const included = includedNameMap(d)
  const rows = resultRows(d)
  if (rows.length === 0) {
    console.log('[Analytics] flow-values-reports returned no rows', { connectionId, startDt, endDt })
  }
  let flowAttributedRevenue = 0

  const rawRows: RankedEntityRow[] = rows.map((row: any, index: number) => {
    const flowId = flowIdFromRow(row)
    const messageId = attributedMessageIdFromRow(row)
    const revenue = numberFromValue(statValue(row, 'conversion_value'))
    flowAttributedRevenue += revenue

    const rowName = flowNameFromRow(row)
    return {
      primaryId: flowId || messageId || `flow-row-${index}`,
      name: rowName !== 'Unknown'
        ? rowName
        : (included.get(flowId) || included.get(messageId) || 'Unknown'),
      revenue,
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

  const flows: KlaviyoAnalyticsFlow[] = aggregateRowsByPrimaryId(rawRows)
    .map((row) => ({
      id: row.primaryId,
      name: row.name,
      revenue: row.revenue,
      openRate: row.openRate,
      clickRate: row.clickRate,
      deliveredCount: row.deliveredCount,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const hydrateTargetCount = Math.min(MAX_NAME_HYDRATIONS_PER_REPORT, flows.length)
  for (let i = 0; i < hydrateTargetCount; i++) {
    const flow = flows[i]
    if (flow.name !== 'Unknown') continue
    const hydrated = await hydrateFlowName(supabase, connectionId, flow.id)
    if (hydrated) {
      flows[i] = { ...flow, name: hydrated }
    } else if (flow.id) {
      flows[i] = { ...flow, name: `Flow ${flow.id}` }
    }
  }

  return { flows, flowAttributedRevenue }
}

export interface PeriodResult {
  totalRevenue: number
  attributedRevenue: number
  campaigns: KlaviyoAnalyticsCampaign[]
  flows: KlaviyoAnalyticsFlow[]
  activeProfiles: number | null
  newSubscribers: number | null
  unsubscribers: number | null
  netGrowth: number | null
  netGrowthPercent: number | null
}

interface FetchPeriodOptions {
  includeListGrowth?: boolean
  includeActiveProfiles?: boolean
  allowSegmentsRead?: boolean
  allowSegmentsWrite?: boolean
}

export async function fetchPeriodData(
  supabase: SupabaseClient,
  connectionId: string,
  periodStart: string, // YYYY-MM-DD
  periodEnd: string,   // YYYY-MM-DD
  metricIds: AnalyticsMetricIds,
  options: FetchPeriodOptions = {}
): Promise<PeriodResult> {
  const includeListGrowth = options.includeListGrowth === true
  const includeActiveProfiles = options.includeActiveProfiles === true
  const allowSegmentsRead = options.allowSegmentsRead !== false
  const allowSegmentsWrite = options.allowSegmentsWrite === true

  const startDt = toKlaviyoDatetime(periodStart, false)
  const endDt = toKlaviyoDatetime(periodEnd, true)
  const dateFilter = [
    `greater-or-equal(datetime,${startDt})`,
    `less-than(datetime,${dayAfter(periodEnd)})`,
  ]

  let revenueResult: RevenueResult = { totalRevenue: 0 }
  let campaignResult: CampaignResult = { campaigns: [], attributedRevenue: 0 }
  let flowResult: FlowResult = { flows: [], flowAttributedRevenue: 0 }

  if (metricIds.placedOrderMetricId) {
    revenueResult = await fetchRevenue(
      supabase,
      connectionId,
      metricIds.placedOrderMetricId,
      dateFilter
    )

    await sleep(REPORTING_GAP_MS)
    campaignResult = await fetchCampaigns(
      supabase,
      connectionId,
      metricIds.placedOrderMetricId,
      startDt,
      endDt
    )

    await sleep(REPORTING_GAP_MS)
    flowResult = await fetchFlows(
      supabase,
      connectionId,
      metricIds.placedOrderMetricId,
      startDt,
      endDt
    )
  }

  let newSubscribers: number | null = null
  let unsubscribers: number | null = null
  let netGrowth: number | null = null
  let netGrowthPercent: number | null = null
  let activeProfiles: number | null = null

  if (includeListGrowth) {
    if (!metricIds.subscribedMetricId) {
      console.warn('[Analytics] Subscribed metric not found; new subscribers will be unavailable', { connectionId })
    }
    if (!metricIds.unsubscribedMetricId) {
      console.warn('[Analytics] Unsubscribed metric not found; unsubscribe metrics will be unavailable', { connectionId })
    }

    if (metricIds.subscribedMetricId) {
      await sleep(REPORTING_GAP_MS)
      const subscribedResult = await fetchMetricCount(
        supabase,
        connectionId,
        metricIds.subscribedMetricId,
        dateFilter,
        'subscribed'
      )
      newSubscribers = subscribedResult.count
    }

    if (metricIds.unsubscribedMetricId) {
      await sleep(REPORTING_GAP_MS)
      const unsubscribedResult = await fetchMetricCount(
        supabase,
        connectionId,
        metricIds.unsubscribedMetricId,
        dateFilter,
        'unsubscribed'
      )
      unsubscribers = unsubscribedResult.count
    }

    if (newSubscribers !== null && unsubscribers !== null) {
      netGrowth = newSubscribers - unsubscribers
    }

    if (includeActiveProfiles) {
      activeProfiles = await fetchActiveProfiles(supabase, connectionId, {
        allowSegmentsRead,
        allowSegmentsWrite,
      })
      if (netGrowth !== null && activeProfiles && activeProfiles > 0) {
        netGrowthPercent = (netGrowth / activeProfiles) * 100
      }
    }
  }

  return {
    totalRevenue: revenueResult.totalRevenue,
    attributedRevenue: campaignResult.attributedRevenue + flowResult.flowAttributedRevenue,
    campaigns: campaignResult.campaigns,
    flows: flowResult.flows,
    activeProfiles,
    newSubscribers,
    unsubscribers,
    netGrowth,
    netGrowthPercent,
  }
}

// ---------------------------------------------------------------------------
// Account Overview — 12-month series reports (campaigns vs flows)
// ---------------------------------------------------------------------------

interface SeriesReportRow {
  dates: string[]
  statistics: Record<string, Array<number | null>>
}

function aggregateSeriesRows(rows: SeriesReportRow[]): {
  months: string[]
  revenue: number[]
  openRate: number[]
  clickRate: number[]
} {
  if (rows.length === 0) return { months: [], revenue: [], openRate: [], clickRate: [] }

  // All rows share the same date buckets — use the first one
  const months = rows[0].dates

  const revenue = new Array<number>(months.length).fill(0)
  const openRateWeightedSum = new Array<number>(months.length).fill(0)
  const openRateWeightTotal = new Array<number>(months.length).fill(0)
  const clickRateWeightedSum = new Array<number>(months.length).fill(0)
  const clickRateWeightTotal = new Array<number>(months.length).fill(0)

  for (const row of rows) {
    const cv = row.statistics.conversion_value ?? []
    const or = row.statistics.open_rate ?? []
    const cr = row.statistics.click_rate ?? []

    for (let i = 0; i < months.length; i++) {
      const rev = cv[i] ?? 0
      revenue[i] += rev

      const weight = rev > 0 ? rev : 1
      if (or[i] != null) {
        openRateWeightedSum[i] += or[i]! * weight
        openRateWeightTotal[i] += weight
      }
      if (cr[i] != null) {
        clickRateWeightedSum[i] += cr[i]! * weight
        clickRateWeightTotal[i] += weight
      }
    }
  }

  const openRate = months.map((_, i) =>
    openRateWeightTotal[i] > 0 ? openRateWeightedSum[i] / openRateWeightTotal[i] : 0
  )
  const clickRate = months.map((_, i) =>
    clickRateWeightTotal[i] > 0 ? clickRateWeightedSum[i] / clickRateWeightTotal[i] : 0
  )

  return { months, revenue, openRate, clickRate }
}

async function fetchFlowSeriesReport(
  supabase: SupabaseClient,
  connectionId: string,
  placedOrderMetricId: string
): Promise<SeriesReportRow[]> {
  const body = {
    data: {
      type: 'flow-series-report',
      attributes: {
        timeframe: { key: 'last_12_months' },
        interval: 'monthly',
        conversion_metric_id: placedOrderMetricId,
        statistics: ['conversion_value', 'open_rate', 'click_rate'],
      },
    },
  }

  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/flow-series-reports/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res || !res.ok) {
    const errorBody = res ? await res.text().catch(() => '') : 'null response'
    console.error('[Analytics] flow-series-report failed:', res?.status ?? 'null', errorBody)
    return []
  }

  const json = await res.json().catch(() => null) as {
    data?: {
      attributes?: {
        dates?: string[]
        date_times?: string[]
        results?: Array<{
          statistics?: Record<string, Array<number | null>>
        }>
      }
    }
  } | null

  const attrs = json?.data?.attributes
  const dates = attrs?.dates ?? attrs?.date_times
  const results = attrs?.results

  if (!dates || !Array.isArray(dates) || !results || !Array.isArray(results)) {
    return []
  }

  return results
    .filter((r) => r.statistics)
    .map((r) => ({ dates, statistics: r.statistics! }))
}

/**
 * Fetch total Klaviyo-attributed monthly placed-order revenue via metric-aggregates.
 * Filters to only attributed orders (where $attributed_message is not empty).
 * Campaign revenue is then derived as: attributed total - flow revenue.
 */
async function fetchMonthlyAttributedRevenue(
  supabase: SupabaseClient,
  connectionId: string,
  placedOrderMetricId: string
): Promise<{ months: string[]; revenue: number[] }> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0) // last day of previous month
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01T00:00:00+00:00`
  const endStr = dayAfter(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`)

  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/metric-aggregates/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: placedOrderMetricId,
          measurements: ['sum_value'],
          interval: 'month',
          page_size: 500,
          by: [],
          filter: [
            `greater-or-equal(datetime,${startStr})`,
            `less-than(datetime,${endStr})`,
            'not(equals($attributed_message,""))',
          ],
        },
      },
    }),
  })

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    console.error('[Analytics] monthly attributed revenue failed:', res?.status ?? 'null', body)
    return { months: [], revenue: [] }
  }

  const payload = await res.json()
  const attrs = payload?.data?.attributes
  const rows = resultRows(payload)
  const dates: string[] = attrs?.dates ?? attrs?.date_times ?? []

  const monthMap = new Map<string, number>()

  if (rows.length === 1 && dates.length > 0) {
    // Single-row format: one row with measurement arrays aligned to dates[]
    const values: number[] = rows[0]?.measurements?.sum_value ?? []
    for (let i = 0; i < dates.length; i++) {
      const monthKey = dates[i].slice(0, 7)
      const prev = monthMap.get(monthKey) || 0
      monthMap.set(monthKey, prev + (typeof values[i] === 'number' ? values[i] : 0))
    }
  } else {
    // Multi-row format: one row per month bucket with a datetime key
    for (const row of rows) {
      const dt = row?.datetime ?? row?.date
      if (typeof dt === 'string') {
        const monthKey = dt.slice(0, 7) // "2025-04"
        const prev = monthMap.get(monthKey) || 0
        monthMap.set(monthKey, prev + numberFromValue(row?.measurements?.sum_value))
      }
    }
  }

  const sorted = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return {
    months: sorted.map(([m]) => `${m}-01T00:00:00+00:00`),
    revenue: sorted.map(([, v]) => v),
  }
}

function monthKeyFromValue(value: unknown): string | null {
  const ymd = parseDateToYmd(value)
  if (!ymd) return null
  return ymd.slice(0, 7)
}

function campaignMonthFromResource(campaign: any): string | null {
  const attrs = campaign?.attributes ?? {}
  const sendStrategy = attrs?.send_strategy ?? attrs?.sendStrategy
  const staticSend = sendStrategy?.static ?? sendStrategy?.static_send ?? sendStrategy?.staticSend
  const sendTime = attrs?.send_time ?? attrs?.sendTime
  const sentAt = attrs?.sent_at ?? attrs?.sentAt
  const scheduledAt = attrs?.scheduled_at ?? attrs?.scheduledAt
  const createdAt = attrs?.created ?? attrs?.created_at ?? attrs?.createdAt

  const candidates: unknown[] = [
    sentAt,
    sendTime,
    scheduledAt,
    staticSend?.datetime,
    staticSend?.send_time,
    staticSend?.scheduled_at,
    sendStrategy?.datetime,
    sendStrategy?.send_time,
    sendStrategy?.scheduled_at,
    createdAt,
  ]

  for (const candidate of candidates) {
    const monthKey = monthKeyFromValue(candidate)
    if (monthKey) return monthKey
  }

  return null
}

async function fetchCampaignMonthById(
  supabase: SupabaseClient,
  connectionId: string,
  campaignIds: Set<string>,
  allowedMonths: Set<string>
): Promise<Map<string, string>> {
  const monthByCampaignId = new Map<string, string>()
  if (campaignIds.size === 0) return monthByCampaignId

  const channelFilter = encodeURIComponent("equals(messages.channel,'email')")
  let nextUrl: string | null = `/api/campaigns/?filter=${channelFilter}`
  let pageCount = 0
  const maxPages = 50

  while (nextUrl && pageCount < maxPages && monthByCampaignId.size < campaignIds.size) {
    const res = await klaviyoFetchWithRetry(supabase, connectionId, nextUrl, undefined, 2)
    if (!res?.ok) {
      const body = res ? await res.text().catch(() => '') : 'null response'
      console.warn('[Campaign Rates] Failed to fetch campaign metadata page', {
        connectionId,
        pageCount,
        status: res?.status ?? 'null',
        body,
      })
      break
    }

    const payload = await res.json().catch(() => null)
    const campaigns = Array.isArray(payload?.data) ? payload.data : []

    for (const campaign of campaigns) {
      const campaignId = firstString(campaign?.id)
      if (!campaignId || !campaignIds.has(campaignId) || monthByCampaignId.has(campaignId)) continue

      const monthKey = campaignMonthFromResource(campaign)
      if (monthKey && allowedMonths.has(monthKey)) {
        monthByCampaignId.set(campaignId, monthKey)
      }
    }

    nextUrl = firstString(payload?.links?.next) || null
    pageCount += 1
  }

  return monthByCampaignId
}

async function fetchCampaignRateRowsLast12Months(
  supabase: SupabaseClient,
  connectionId: string,
  placedOrderMetricId: string
): Promise<any[]> {
  const res = await klaviyoFetchWithRetry(supabase, connectionId, '/api/campaign-values-reports/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          timeframe: { key: 'last_12_months' },
          conversion_metric_id: placedOrderMetricId,
          statistics: ['open_rate', 'click_rate', 'delivered'],
          filter: 'equals(send_channel,"email")',
          group_by: ['campaign_message_id', 'campaign_id', 'send_channel'],
        },
      },
    }),
  })

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => '') : 'null response'
    console.error('[Campaign Rates] campaign-values-report (last_12_months) failed', {
      connectionId,
      status: res?.status ?? 'null',
      body,
    })
    return []
  }

  const payload = await res.json().catch(() => null)
  return resultRows(payload)
}

/**
 * Build monthly campaign open/click rates from campaign-values reports.
 * This aligns the math with campaign reporting in Klaviyo:
 * aggregate per-campaign rates weighted by delivered count.
 */
async function fetchCampaignMonthlyRates(
  supabase: SupabaseClient,
  connectionId: string,
  placedOrderMetricId: string,
  months: string[]
): Promise<{ openRate: number[]; clickRate: number[] }> {
  const openRate = months.map(() => 0)
  const clickRate = months.map(() => 0)

  try {
    const monthKeys = months.map((m) => m.slice(0, 7))
    const monthSet = new Set(monthKeys)
    const rows = await fetchCampaignRateRowsLast12Months(supabase, connectionId, placedOrderMetricId)

    const campaignIds = new Set(
      rows
        .map((row) => campaignIdFromRow(row))
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )

    const campaignMonthById = await fetchCampaignMonthById(
      supabase,
      connectionId,
      campaignIds,
      monthSet
    )
    console.log('[Campaign Rates] last_12_months rows=%d campaignIds=%d mappedMonths=%d', rows.length, campaignIds.size, campaignMonthById.size)

    const aggregates = new Map<string, {
      delivered: number
      openWeightedSum: number
      clickWeightedSum: number
      openUnweightedSum: number
      clickUnweightedSum: number
      unweightedCount: number
    }>()

    for (const key of monthSet) {
      aggregates.set(key, {
        delivered: 0,
        openWeightedSum: 0,
        clickWeightedSum: 0,
        openUnweightedSum: 0,
        clickUnweightedSum: 0,
        unweightedCount: 0,
      })
    }

    for (const row of rows) {
      const campaignId = campaignIdFromRow(row)
      if (!campaignId) continue

      const inferredMonthFromRow = monthKeyFromValue(
        row?.datetime
        ?? row?.date
        ?? row?.send_time
        ?? row?.sendTime
      )
      const monthKey = campaignMonthById.get(campaignId)
        ?? (inferredMonthFromRow && monthSet.has(inferredMonthFromRow) ? inferredMonthFromRow : null)
      if (!monthKey) continue

      const aggregate = aggregates.get(monthKey)
      if (!aggregate) continue

      const delivered = numberFromValue(statValue(row, 'delivered'))
      const rowOpenRate = numberFromValue(statValue(row, 'open_rate'))
      const rowClickRate = numberFromValue(statValue(row, 'click_rate'))

      if (delivered > 0) {
        aggregate.delivered += delivered
        aggregate.openWeightedSum += rowOpenRate * delivered
        aggregate.clickWeightedSum += rowClickRate * delivered
      } else {
        aggregate.openUnweightedSum += rowOpenRate
        aggregate.clickUnweightedSum += rowClickRate
        aggregate.unweightedCount += 1
      }
    }

    for (let i = 0; i < monthKeys.length; i++) {
      const aggregate = aggregates.get(monthKeys[i])
      if (!aggregate) continue

      if (aggregate.delivered > 0) {
        openRate[i] = aggregate.openWeightedSum / aggregate.delivered
        clickRate[i] = aggregate.clickWeightedSum / aggregate.delivered
      } else if (aggregate.unweightedCount > 0) {
        openRate[i] = aggregate.openUnweightedSum / aggregate.unweightedCount
        clickRate[i] = aggregate.clickUnweightedSum / aggregate.unweightedCount
      }
    }

    return { openRate, clickRate }
  } catch (err) {
    console.error('[Campaign Rates] Error:', err)
    return { openRate, clickRate }
  }
}

export async function fetchAccountOverview(
  supabase: SupabaseClient,
  connectionId: string,
  placedOrderMetricId: string
): Promise<KlaviyoAnalyticsData['accountOverview']> {
  try {
    console.log('[Account Overview] Starting for connection=%s, metricIds: placed=%s',
      connectionId, placedOrderMetricId)

    // 1. Flow series (has a dedicated series endpoint)
    const flowRows = await fetchFlowSeriesReport(supabase, connectionId, placedOrderMetricId)
    const flow = aggregateSeriesRows(flowRows)

    if (flow.months.length === 0) {
      console.warn('[Account Overview] No flow months found, returning null')
      return null
    }

    // 2. Klaviyo-attributed monthly revenue via metric-aggregates
    await sleep(REPORTING_GAP_MS)
    const totalMonthly = await fetchMonthlyAttributedRevenue(supabase, connectionId, placedOrderMetricId)

    // 3. Derive campaign revenue = attributed total - flow per month
    const totalByMonth = new Map<string, number>()
    for (let i = 0; i < totalMonthly.months.length; i++) {
      const key = totalMonthly.months[i].slice(0, 7)
      totalByMonth.set(key, totalMonthly.revenue[i])
    }

    const months = flow.months
    const campaignRevenue = months.map((m, i) => {
      const key = m.slice(0, 7)
      const total = totalByMonth.get(key) ?? 0
      return Math.max(0, total - flow.revenue[i])
    })

    // 4. Campaign open/click rates via campaign-values reports (monthly)
    let campaignOpenRate = months.map(() => 0)
    let campaignClickRate = months.map(() => 0)

    console.log('[Account Overview] Campaign revenue derived:', campaignRevenue)

    console.log('[Account Overview] Fetching campaign rates from campaign-values reports...')
    await sleep(REPORTING_GAP_MS)
    const campaignRates = await fetchCampaignMonthlyRates(
      supabase,
      connectionId,
      placedOrderMetricId,
      months
    )
    campaignOpenRate = campaignRates.openRate
    campaignClickRate = campaignRates.clickRate

    const result = {
      months,
      campaignRevenue,
      flowRevenue: flow.revenue,
      campaignOpenRate,
      flowOpenRate: flow.openRate,
      campaignClickRate,
      flowClickRate: flow.clickRate,
    }

    console.log('[Account Overview] FINAL RESULT:', {
      months: months.length,
      campaignRevenue,
      campaignOpenRate,
      campaignClickRate,
      flowRevenue: flow.revenue,
      flowOpenRate: flow.openRate,
      flowClickRate: flow.clickRate,
    })

    return result
  } catch (err) {
    console.error('[Account Overview] Error:', err)
    return null
  }
}
