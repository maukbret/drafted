# Klaviyo Subscribe/Unsubscribe Metrics — Implementation Handoff

This document describes exactly how subscribe/unsubscribe metrics are tracked via the Klaviyo API in Mauk.AI. Use it as a complete reference to rebuild the same feature in another app.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites & Environment Variables](#2-prerequisites--environment-variables)
3. [Klaviyo OAuth Flow](#3-klaviyo-oauth-flow)
4. [Token Management](#4-token-management)
5. [Database Schema](#5-database-schema)
6. [Klaviyo API Calls](#6-klaviyo-api-calls)
7. [Metric Discovery](#7-metric-discovery)
8. [Fetching Subscribe/Unsubscribe Counts](#8-fetching-subscribeunsubscribe-counts)
9. [Active Profile Count (via Managed Segment)](#9-active-profile-count-via-managed-segment)
10. [Calculating Net Growth](#10-calculating-net-growth)
11. [Rate Limiting & Retry Strategy](#11-rate-limiting--retry-strategy)
12. [Data Structures](#12-data-structures)
13. [UI Display Patterns](#13-ui-display-patterns)
14. [Key Caveats & Known Gotchas](#14-key-caveats--known-gotchas)

---

## 1. Overview

The feature tracks three core list-growth metrics for a given date range:

| Metric | Source |
|---|---|
| **New Subscribers** | Count from the Klaviyo "Subscribed to Email Marketing" metric |
| **Unsubscribers** | Count from the Klaviyo "Unsubscribed from Email Marketing" metric |
| **Active Profiles** | Current count of email-marketable profiles via a managed Klaviyo segment |

From these three values, two derived metrics are computed:

- **Net Growth** = New Subscribers − Unsubscribers
- **Net Growth %** = (Net Growth / Active Profiles) × 100

All data is fetched **on-demand** from the Klaviyo API; there is no background sync or cron job for analytics.

---

## 2. Prerequisites & Environment Variables

### Required Klaviyo OAuth App Settings

Create an OAuth app in the Klaviyo developer portal. The app must request the following scopes:

| Scope | Purpose |
|---|---|
| `metrics:read` | Fetch metric definitions and aggregated counts |
| `segments:read` | Read segment profile counts |
| `segments:write` | Create the managed reporting segment |
| `campaigns:read` | (Optional) Campaign performance data |
| `flows:read` | (Optional) Flow performance data |

### Environment Variables

```env
# Klaviyo OAuth
KLAVIYO_CLIENT_ID=<your_oauth_app_client_id>
KLAVIYO_CLIENT_SECRET=<your_oauth_app_client_secret>
NEXT_PUBLIC_KLAVIYO_CLIENT_ID=<same_as_KLAVIYO_CLIENT_ID>
NEXT_PUBLIC_KLAVIYO_REDIRECT_URI=https://yourdomain.com/api/auth/klaviyo/callback

# Database (Supabase shown, adapt as needed)
NEXT_PUBLIC_SUPABASE_URL=<supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_role_key>
```

---

## 3. Klaviyo OAuth Flow

Klaviyo uses OAuth 2.0 with PKCE. The flow is:

### Step 1 — Initiate Authorization (frontend)

```
GET https://www.klaviyo.com/oauth/authorize
  ?client_id=<KLAVIYO_CLIENT_ID>
  &redirect_uri=<NEXT_PUBLIC_KLAVIYO_REDIRECT_URI>
  &response_type=code
  &scope=metrics:read segments:read segments:write campaigns:read flows:read
  &state=<random_state>
  &code_challenge=<pkce_challenge>
  &code_challenge_method=S256
```

Generate the PKCE pair server-side or in a secure context:

```typescript
// Generate PKCE code verifier and challenge
const codeVerifier = crypto.randomBytes(32).toString('base64url')
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url')
```

Store `codeVerifier` and `state` in an HTTP-only cookie or session for the callback.

### Step 2 — Handle Callback (backend route: `/api/auth/klaviyo/callback`)

```typescript
// Exchange authorization code for tokens
const tokenResponse = await fetch('https://a.klaviyo.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,            // from query string
    redirect_uri: KLAVIYO_REDIRECT_URI,
    client_id: KLAVIYO_CLIENT_ID,
    client_secret: KLAVIYO_CLIENT_SECRET,
    code_verifier: storedCodeVerifier,  // from cookie/session
  }),
})

const { access_token, refresh_token, expires_in, scope } = await tokenResponse.json()

// Persist tokens — see Database Schema section
await db.klaviyo_connections.upsert({
  user_id: currentUserId,
  access_token,
  refresh_token,
  expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  scope,
})
```

---

## 4. Token Management

**File reference:** `src/lib/klaviyo.ts` — function `getValidKlaviyoToken()`

Tokens must be refreshed before use. The implementation uses an in-memory lock map to prevent race conditions when multiple requests try to refresh the same token concurrently.

### Logic

```typescript
const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes before expiry

async function getValidKlaviyoToken(connectionId: string): Promise<string> {
  const connection = await db.klaviyo_connections.findById(connectionId)

  const expiresAt = new Date(connection.expires_at).getTime()
  const needsRefresh = Date.now() >= expiresAt - REFRESH_BUFFER_MS

  if (!needsRefresh) {
    return connection.access_token
  }

  // Prevent concurrent refresh for the same connection
  if (refreshLocks.has(connectionId)) {
    await refreshLocks.get(connectionId)       // Wait for in-flight refresh
    return db.klaviyo_connections.findById(connectionId).then(c => c.access_token)
  }

  const refreshPromise = (async () => {
    const res = await fetch('https://a.klaviyo.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
        client_id: KLAVIYO_CLIENT_ID,
        client_secret: KLAVIYO_CLIENT_SECRET,
      }),
    })

    const { access_token, refresh_token, expires_in } = await res.json()

    await db.klaviyo_connections.update(connectionId, {
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
    })

    return access_token
  })()

  refreshLocks.set(connectionId, refreshPromise)

  try {
    return await refreshPromise
  } finally {
    refreshLocks.delete(connectionId)
  }
}

// Module-level lock map (in-memory, per server process)
const refreshLocks = new Map<string, Promise<string>>()
```

### Making Authenticated Klaviyo Requests

Every API call should:
1. Call `getValidKlaviyoToken()` first
2. Set `Authorization: Bearer <token>` and `revision: 2024-02-15` headers

```typescript
async function klaviyoFetch(connectionId: string, path: string, options: RequestInit = {}) {
  const token = await getValidKlaviyoToken(connectionId)

  const response = await fetch(`https://a.klaviyo.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'revision': '2024-02-15',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`Klaviyo API error ${response.status}: ${await response.text()}`)
  }

  return response.json()
}
```

---

## 5. Database Schema

Minimal schema needed to support this feature.

```sql
-- Stores OAuth tokens per user (one row per connected Klaviyo account)
CREATE TABLE klaviyo_connections (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  scope         text,
  -- Optional metadata from GET /api/accounts/
  klaviyo_account_id  text,
  account_name        text,
  store_url           text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Optional: cache analytics results to avoid re-fetching
CREATE TABLE klaviyo_analytics_cache (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  uuid  NOT NULL REFERENCES klaviyo_connections(id) ON DELETE CASCADE,
  cache_key      text  NOT NULL,   -- e.g. "list_growth_2024-01_2024-01"
  period_start   date  NOT NULL,
  period_end     date  NOT NULL,
  data           jsonb NOT NULL,
  fetched_at     timestamptz DEFAULT now(),
  UNIQUE(connection_id, cache_key)
);
```

Enable Row-Level Security and add a policy so users can only read their own connections:

```sql
ALTER TABLE klaviyo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own connections"
  ON klaviyo_connections FOR ALL
  USING (user_id = auth.uid());
```

---

## 6. Klaviyo API Calls

All requests use base URL `https://a.klaviyo.com` with header `revision: 2024-02-15`.

### 6a. Fetch All Metrics (for discovery)

```
GET /api/metrics/
```

Paginate through all pages:

```typescript
async function fetchAllMetrics(connectionId: string): Promise<KlaviyoMetric[]> {
  const metrics: KlaviyoMetric[] = []
  let url = '/api/metrics/'

  while (url) {
    const data = await klaviyoFetch(connectionId, url)
    metrics.push(...data.data)
    url = data.links?.next ?? null   // null = last page
  }

  return metrics
}
```

Response shape per metric:

```json
{
  "type": "metric",
  "id": "abc123",
  "attributes": {
    "name": "Subscribed to Email Marketing",
    "created": "2023-01-01T00:00:00+00:00",
    "updated": "2024-01-01T00:00:00+00:00",
    "integration": { "object": "-2", "name": "API" }
  }
}
```

### 6b. Fetch Metric Aggregates (subscribe/unsubscribe counts)

```
POST /api/metric-aggregates/
```

Request body:

```json
{
  "data": {
    "type": "metric-aggregate",
    "attributes": {
      "metric_id": "<subscribedMetricId>",
      "measurements": ["count"],
      "interval": "day",
      "by": [],
      "filter": [
        "greater-or-equal(datetime,2024-01-01T00:00:00+00:00)",
        "less-than(datetime,2024-02-01T00:00:00+00:00)"
      ]
    }
  }
}
```

> **Important:** Always include both `greater-or-equal` and `less-than` filters. Omitting them can produce unreliable counts.

Response shape:

```json
{
  "data": {
    "type": "metric-aggregate",
    "id": "...",
    "attributes": {
      "results": [
        {
          "dimensions": [],
          "measurements": {
            "count": [12, 5, 8, ...]   // one value per day in range
          }
        }
      ],
      "by": [],
      "measurements": ["count"],
      "interval": "day",
      "dates": ["2024-01-01", "2024-01-02", ...]
    }
  }
}
```

Sum all values in `results[0].measurements.count` to get the total for the date range.

### 6c. List Segments

```
GET /api/segments/
```

Used to check whether the managed reporting segment already exists before creating it.

### 6d. Create Segment

```
POST /api/segments/
```

Request body:

```json
{
  "data": {
    "type": "segment",
    "attributes": {
      "name": "YourApp Reporting Segment",
      "definition": {
        "condition_groups": [
          {
            "conditions": [
              {
                "type": "profile/subscriptions",
                "channel": "email",
                "subscription_status": "can_receive_marketing"
              }
            ]
          }
        ]
      }
    }
  }
}
```

### 6e. Fetch Segment Profile Count

```
GET /api/segments/<segmentId>/?additional-fields[segment]=profile_count
```

Response:

```json
{
  "data": {
    "id": "<segmentId>",
    "attributes": {
      "name": "YourApp Reporting Segment",
      "profile_count": 42381
    }
  }
}
```

---

## 7. Metric Discovery

**File reference:** `src/lib/klaviyo-analytics.ts` — function `discoverMetricIds()`

Metric IDs differ per Klaviyo account. Discover them by fuzzy-matching known metric names.

```typescript
const SUBSCRIBED_CANDIDATES = [
  'Subscribed to Email Marketing',
  'Subscribed to List',
  'Subscribed',
]

const UNSUBSCRIBED_CANDIDATES = [
  'Unsubscribed from Email Marketing',
  'Clicked email to unsubscribe',
  'Unsubscribed',
]

// Exclude SMS/push variants from matching
const EXCLUDE_PATTERNS = ['sms', 'push', 'mobile']

function discoverMetricIds(metrics: KlaviyoMetric[]): AnalyticsMetricIds {
  const emailMetrics = metrics.filter(m =>
    !EXCLUDE_PATTERNS.some(p => m.attributes.name.toLowerCase().includes(p))
  )

  const find = (candidates: string[]) => {
    for (const candidate of candidates) {
      const match = emailMetrics.find(m =>
        m.attributes.name.toLowerCase() === candidate.toLowerCase()
      )
      if (match) return match.id
    }
    return null
  }

  return {
    subscribedMetricId: find(SUBSCRIBED_CANDIDATES),
    unsubscribedMetricId: find(UNSUBSCRIBED_CANDIDATES),
  }
}
```

> **Cache this result** — metric IDs are stable per account. Cache for at least 15 minutes to avoid redundant pagination.

---

## 8. Fetching Subscribe/Unsubscribe Counts

**File reference:** `src/lib/klaviyo-analytics.ts` — function `fetchMetricCount()`

For date ranges longer than 364 days (Klaviyo API limit per request), split into windows:

```typescript
async function fetchMetricCount(
  connectionId: string,
  metricId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const MAX_WINDOW_DAYS = 364
  const windows = splitDateRange(startDate, endDate, MAX_WINDOW_DAYS)

  let total = 0

  for (const { start, end } of windows) {
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: ['count'],
          interval: 'day',
          by: [],
          filter: [
            `greater-or-equal(datetime,${toKlaviyoDatetime(start)})`,
            `less-than(datetime,${toKlaviyoDatetime(end)})`,
          ],
        },
      },
    }

    const data = await klaviyoFetch(connectionId, '/api/metric-aggregates/', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const counts: number[] = data.data?.attributes?.results?.[0]?.measurements?.count ?? []
    total += counts.reduce((sum, n) => sum + n, 0)
  }

  return total
}

function toKlaviyoDatetime(date: Date): string {
  // Format: YYYY-MM-DDTHH:MM:SS+00:00
  return date.toISOString().replace('Z', '+00:00').split('.')[0] + '+00:00'
}

function splitDateRange(
  start: Date,
  end: Date,
  maxDays: number,
): { start: Date; end: Date }[] {
  const windows = []
  let current = new Date(start)

  while (current < end) {
    const windowEnd = new Date(current)
    windowEnd.setDate(windowEnd.getDate() + maxDays)
    windows.push({ start: new Date(current), end: windowEnd > end ? end : windowEnd })
    current = windowEnd > end ? end : windowEnd
  }

  return windows
}
```

---

## 9. Active Profile Count (via Managed Segment)

**File reference:** `src/lib/klaviyo-analytics.ts` — function `fetchActiveProfiles()`

This is a two-step process: find or create a segment, then read its `profile_count`.

```typescript
const MANAGED_SEGMENT_NAME = 'YourApp Reporting Segment'

async function fetchActiveProfiles(connectionId: string): Promise<number | null> {
  // Step 1: Find existing managed segment
  let segmentId = await findManagedSegment(connectionId)

  // Step 2: Create it if it doesn't exist
  if (!segmentId) {
    segmentId = await createManagedSegment(connectionId)

    // Newly created segments need time to populate — wait up to ~2 minutes
    await waitForSegmentPopulation(connectionId, segmentId)
  }

  // Step 3: Fetch profile count
  const data = await klaviyoFetch(
    connectionId,
    `/api/segments/${segmentId}/?additional-fields[segment]=profile_count`,
  )

  return data.data?.attributes?.profile_count ?? null
}

async function findManagedSegment(connectionId: string): Promise<string | null> {
  const data = await klaviyoFetch(connectionId, '/api/segments/')
  const segment = data.data?.find(
    (s: any) => s.attributes?.name === MANAGED_SEGMENT_NAME,
  )
  return segment?.id ?? null
}

async function createManagedSegment(connectionId: string): Promise<string> {
  const body = {
    data: {
      type: 'segment',
      attributes: {
        name: MANAGED_SEGMENT_NAME,
        definition: {
          condition_groups: [
            {
              conditions: [
                {
                  type: 'profile/subscriptions',
                  channel: 'email',
                  subscription_status: 'can_receive_marketing',
                },
              ],
            },
          ],
        },
      },
    },
  }

  const data = await klaviyoFetch(connectionId, '/api/segments/', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return data.data.id
}

async function waitForSegmentPopulation(
  connectionId: string,
  segmentId: string,
  maxAttempts = 4,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(30_000) // 30 seconds per attempt

    const data = await klaviyoFetch(
      connectionId,
      `/api/segments/${segmentId}/?additional-fields[segment]=profile_count`,
    )

    const count = data.data?.attributes?.profile_count
    if (count != null && count > 0) return
  }
  // If still zero after warmup, proceed anyway — return what we have
}
```

> **Scope requirement:** The connected Klaviyo account must have `segments:write` to create the segment. If it only has `segments:read`, fall back to returning `null` for active profiles.

---

## 10. Calculating Net Growth

Once all three raw values are in hand, derived metrics are trivial:

```typescript
interface ListGrowthMetrics {
  newSubscribers: number | null
  unsubscribers: number | null
  activeProfiles: number | null
  netGrowth: number | null
  netGrowthPercent: number | null
}

function calculateListGrowth(
  newSubscribers: number | null,
  unsubscribers: number | null,
  activeProfiles: number | null,
): ListGrowthMetrics {
  const netGrowth =
    newSubscribers != null && unsubscribers != null
      ? newSubscribers - unsubscribers
      : null

  const netGrowthPercent =
    netGrowth != null && activeProfiles != null && activeProfiles > 0
      ? (netGrowth / activeProfiles) * 100
      : null

  return { newSubscribers, unsubscribers, activeProfiles, netGrowth, netGrowthPercent }
}
```

---

## 11. Rate Limiting & Retry Strategy

**File reference:** `src/lib/klaviyo-rate-limited-fetch.ts`

Klaviyo enforces per-key rate limits. Handle them correctly to avoid silent data gaps.

### Per-user throttle (in-app protection)

```typescript
// Max 20 API calls per 60 seconds per connection
// Min 2 seconds between consecutive requests
```

### Retry on 429 / 503

```typescript
async function klaviyoFetchWithRetry(
  connectionId: string,
  path: string,
  options: RequestInit = {},
  maxRetries = 3,
): Promise<any> {
  let attempt = 0

  while (attempt < maxRetries) {
    const token = await getValidKlaviyoToken(connectionId)

    const response = await fetch(`https://a.klaviyo.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        revision: '2024-02-15',
        ...options.headers,
      },
    })

    if (response.status === 429 || response.status === 503) {
      // Respect Retry-After header if present
      const retryAfter = response.headers.get('Retry-After')
      let waitMs = 3_000 // default 3 seconds

      if (retryAfter) {
        waitMs = parseInt(retryAfter, 10) * 1000
      } else {
        // Try to parse from response body: "available in X seconds"
        const body = await response.text()
        const match = body.match(/available in (\d+) seconds/)
        if (match) waitMs = parseInt(match[1], 10) * 1000
      }

      // Clamp to 3–30 seconds
      waitMs = Math.max(3_000, Math.min(30_000, waitMs))
      await sleep(waitMs)
      attempt++
      continue
    }

    if (!response.ok) {
      throw new Error(`Klaviyo ${response.status}: ${await response.text()}`)
    }

    return response.json()
  }

  throw new Error(`Klaviyo request failed after ${maxRetries} retries`)
}
```

---

## 12. Data Structures

### TypeScript interfaces

```typescript
interface AnalyticsMetricIds {
  subscribedMetricId: string | null
  unsubscribedMetricId: string | null
}

interface ListGrowthMetrics {
  newSubscribers: number | null    // Count of "Subscribed to Email Marketing" events in period
  unsubscribers: number | null     // Count of "Unsubscribed from Email Marketing" events in period
  activeProfiles: number | null    // Current email-marketable profile count (from segment)
  netGrowth: number | null         // newSubscribers - unsubscribers
  netGrowthPercent: number | null  // (netGrowth / activeProfiles) * 100
}

interface KlaviyoMetric {
  type: 'metric'
  id: string
  attributes: {
    name: string
    created: string
    updated: string
    integration: { object: string; name: string }
  }
}
```

### JSON stored in DB cache (if used)

```json
{
  "newSubscribers": 1234,
  "unsubscribers": 87,
  "activeProfiles": 42381,
  "netGrowth": 1147,
  "netGrowthPercent": 2.71
}
```

---

## 13. UI Display Patterns

**File reference:** `src/components/report-detail-page.tsx`

Display the five metrics as stat cards. Apply sign formatting to `netGrowth` and `netGrowthPercent`:

```typescript
// Format net growth with explicit +/- sign
function formatNetGrowth(value: number | null): string {
  if (value == null) return '—'
  return value >= 0 ? `+${value.toLocaleString()}` : value.toLocaleString()
}

// Format as percentage with sign
function formatNetGrowthPercent(value: number | null): string {
  if (value == null) return '—'
  const formatted = Math.abs(value).toFixed(2) + '%'
  return value >= 0 ? `+${formatted}` : `-${formatted}`
}
```

Card layout:

| Label | Value | Icon |
|---|---|---|
| Active Profiles | `42,381` | Users icon |
| New Subscribers | `+1,234` | TrendingUp icon (green) |
| Unsubscribers | `87` | TrendingDown icon (red) |
| Net Growth | `+1,147` | TrendingUp/Down based on sign |
| Net Growth % | `+2.71%` | TrendingUp/Down based on sign |

Show a loading skeleton while data is fetching. Show `—` for any `null` value (e.g. metric not found in account, or segment not yet populated).

---

## 14. Key Caveats & Known Gotchas

### Metric names vary per account

Different Klaviyo accounts may use different metric names. Always fuzzy-match against a list of known candidates (see [Section 7](#7-metric-discovery)). If no match is found, return `null` and surface a message in the UI explaining the metric could not be found.

### Metric IDs are account-specific

Never hardcode a metric ID. Always discover them via the `/api/metrics/` endpoint at runtime.

### All-time net growth vs. period net growth

Net growth here is calculated for a **specific date window**, not all-time. If you need all-time net subscribers, sum metric-aggregates from the account's creation date to today, splitting into 364-day windows.

### Segment warm-up delay

A newly created segment returns `profile_count: 0` for approximately 1–2 minutes. The retry loop in Section 9 handles this. Do not treat a zero count as "no subscribers" without confirming the segment is fully populated.

### `segments:write` scope may not be granted

If the user connected their Klaviyo account without the `segments:write` scope, segment creation will fail with a 403. In this case:
- Fall back to returning `null` for `activeProfiles`
- Hide the Net Growth % metric in the UI (it requires active profiles as the denominator)
- Show the user a message prompting them to reconnect with the additional scope

### Date format

Klaviyo requires ISO 8601 with offset, **not** a bare UTC `Z`:

```
Correct:   2024-01-01T00:00:00+00:00
Incorrect: 2024-01-01T00:00:00Z
```

### Klaviyo API revision header

Always pass `revision: 2024-02-15`. Omitting this header may cause unexpected response shapes or errors.

### Maximum 364 days per metric-aggregates request

The `/api/metric-aggregates/` endpoint silently truncates or errors on ranges longer than 364 days. Always chunk long ranges (see [Section 8](#8-fetching-subscribeunsubscribe-counts)).

---

*Exported from Mauk.AI — last updated 2026-05-11*
