# Reporting Feature Transfer Guide

This guide summarizes the reporting feature in this app and packages it as an implementation brief for another coding agent.

## What The Feature Does

The reporting feature generates client-ready Klaviyo performance reports from live Klaviyo data. A user chooses:

- Klaviyo account/connection
- Report date range
- Comparison date range
- Whether to include list growth
- Whether to include AI insights/action items
- Whether to include a 12-month account overview
- Report language, currently `en` or `nl`

The app fetches analytics from Klaviyo live, saves a JSON snapshot in Supabase, then renders a saved report detail page. AI insights and PDF export sit on top of the saved report snapshot.

## Main Architecture

The implementation has four layers:

1. Access and connection layer
   - Supabase Auth identifies the user.
   - Klaviyo OAuth tokens are stored in `klaviyo_connections`.
   - `src/lib/klaviyo.ts` refreshes Klaviyo tokens with an in-memory per-connection lock.
   - `src/lib/klaviyo-connection-access.ts` controls who can use/report on a connection.

2. Live analytics layer
   - `GET /api/klaviyo/analytics/dashboard`
   - Validates connection access, date ranges, feature scopes, and throttling.
   - Calls `src/lib/klaviyo-analytics.ts` to aggregate Klaviyo API data.
   - Returns a `KlaviyoAnalyticsData` payload.

3. Saved report layer
   - `POST /api/reports`
   - Validates and persists the analytics snapshot to `analytics_reports.analytics_data`.
   - Report detail pages read from this saved snapshot, not Klaviyo.

4. Presentation layer
   - `/reports` creates reports and lists saved reports.
   - `/reports/[reportId]` displays revenue cards, top campaigns, top flows, list growth, account overview charts, AI insights, and PDF export.
   - `POST /api/reports/[reportId]/insights` generates/persists AI insights.

## Important Source Files

- `src/app/(app)/reports/page.tsx` - server page for report list, feature gating, loading connections and saved reports.
- `src/components/reports-page-client.tsx` - create-report modal, generation progress, orchestration of live fetch -> save -> optional insights -> navigate.
- `src/app/api/klaviyo/analytics/dashboard/route.ts` - live analytics endpoint.
- `src/lib/klaviyo-analytics.ts` - Klaviyo reporting aggregation logic.
- `src/app/api/reports/route.ts` - saves a generated report.
- `src/app/(app)/reports/[reportId]/page.tsx` - loads saved report detail.
- `src/components/report-detail-page.tsx` - report display, title editing, AI insights, PDF export.
- `src/app/api/reports/[reportId]/insights/route.ts` - AI insights endpoint.
- `src/lib/report-insights.ts` - AI insight schema normalization/parsing.
- `src/lib/ai/types.ts` - insight prompt builder and compact analytics payload.
- `src/lib/report-pdf.ts` - jsPDF export.
- `src/components/analytics/*` - reusable charts/cards/tables.
- `src/lib/report-dates.ts` - date validation/range formatting.
- `src/lib/feature-access.ts` - `FEATURE_REPORTS_ENABLED` and user allowlist.

## Database Requirements

The minimum saved-report table is `analytics_reports`.

```sql
create table analytics_reports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  connection_id uuid references klaviyo_connections(id) on delete set null,
  title text not null,
  account_label text not null,
  period_month text not null,
  compare_month text not null,
  period_start date not null,
  period_end date not null,
  compare_start date not null,
  compare_end date not null,
  include_list_growth boolean not null default false,
  add_summary boolean not null default true,
  include_action_items boolean not null default true,
  include_account_overview boolean not null default false,
  language text not null default 'en',
  status text not null default 'ready' check (status in ('ready')),
  analytics_data jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  ai_status text not null default 'idle' check (ai_status in ('idle', 'generating', 'ready', 'failed')),
  ai_insights jsonb,
  ai_model text,
  ai_generated_at timestamptz,
  ai_error text
);

create index idx_analytics_reports_user_created
  on analytics_reports(user_id, created_at desc);

create index idx_analytics_reports_ai_status
  on analytics_reports(user_id, ai_status, created_at desc);

alter table analytics_reports enable row level security;

create policy "Users can view own analytics reports"
  on analytics_reports for select
  using (auth.uid() = user_id);

create policy "Users can insert own analytics reports"
  on analytics_reports for insert
  with check (auth.uid() = user_id);

create policy "Users can update own analytics reports"
  on analytics_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Related migrations in this repo:

- `041_add_analytics_reports.sql`
- `042_add_report_date_ranges_and_update_policy.sql`
- `043_add_report_ai_insights.sql`
- `044_add_report_language.sql`
- `045_add_report_account_overview.sql`

## Environment And Dependencies

Feature flags:

- `FEATURE_REPORTS_ENABLED=true` enables reports for all users.
- `FEATURE_REPORTS_ALLOWED_USER_IDS=<uuid,uuid>` enables reports for specific users.

AI:

- `AI_PROVIDER=gemini` or `AI_PROVIDER=anthropic`
- Gemini: `GEMINI_API_KEY`, optional `GEMINI_MODEL`, default `gemini-2.0-flash`
- Anthropic: `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`, default `claude-sonnet-4-20250514`

UI/export dependencies used by the current implementation:

- `recharts` for account overview charts
- `@tanstack/react-table` for top campaign/flow tables
- `jspdf` and `jspdf-autotable` for PDF export
- `date-fns`, `react-day-picker`, Radix UI, shadcn-style UI components

Klaviyo OAuth scopes needed:

- Required for base reporting: `metrics:read`
- Required for list growth profile count: `segments:read`
- Recommended for list growth setup: `segments:write`
- Required for account overview: `campaigns:read` and `flows:read`

## Analytics Data Contract

The saved report stores this JSON shape in `analytics_reports.analytics_data`:

```ts
interface KlaviyoAnalyticsData {
  totalRevenue: number
  compTotalRevenue: number
  attributedRevenue: number
  compAttributedRevenue: number
  campaigns: KlaviyoAnalyticsCampaign[]
  compCampaigns: KlaviyoAnalyticsCampaign[]
  flows: KlaviyoAnalyticsFlow[]
  compFlows: KlaviyoAnalyticsFlow[]
  activeProfiles?: number | null
  newSubscribers?: number | null
  unsubscribers?: number | null
  netGrowth?: number | null
  netGrowthPercent?: number | null
  accountOverview?: {
    months: string[]
    campaignRevenue: number[]
    flowRevenue: number[]
    campaignOpenRate: number[]
    flowOpenRate: number[]
    campaignClickRate: number[]
    flowClickRate: number[]
  } | null
}

interface KlaviyoAnalyticsCampaign {
  id: string
  name: string
  revenue: number
  openRate: number
  clickRate: number
  deliveredCount: number
}

type KlaviyoAnalyticsFlow = KlaviyoAnalyticsCampaign
```

## How Klaviyo Analytics Are Fetched

`src/lib/klaviyo-analytics.ts` is the highest-value file to reuse.

Core flow:

1. Discover metric IDs with `GET /api/metrics/`.
   - Placed Order
   - Subscribed to Email Marketing/Subscribed to List
   - Unsubscribed from Email Marketing/Unsubscribed
   - Opened Email
   - Clicked Email
   - Received Email
   - Metric IDs are cached in memory for 15 minutes.

2. For each current/comparison date range, call `fetchPeriodData`.
   - Total revenue comes from `/api/metric-aggregates/` on the Placed Order metric with `sum_value`.
   - Campaign data comes from `/api/campaign-values-reports/` with `conversion_value`, `open_rate`, `click_rate`.
   - Flow data comes from `/api/flow-values-reports/` with the same statistics.
   - Attributed revenue is campaign attributed revenue plus flow attributed revenue.
   - Top campaigns and flows are sorted by revenue.

3. Optional list growth.
   - New subscribers and unsubscribers come from metric aggregate counts.
   - Active profile count comes from a managed Klaviyo segment named `Mauk.ai Reporting Segment`.
   - The segment ID and profile count are cached.
   - Segment creation is guarded by a per-connection in-memory lock to avoid duplicate segment creation.

4. Optional account overview.
   - Flow monthly series comes from `/api/flow-series-reports/`.
   - Total monthly attributed revenue comes from `/api/metric-aggregates/` filtered to attributed messages.
   - Campaign revenue is derived as `total attributed revenue - flow revenue`.
   - Campaign monthly open/click rates come from campaign values reports and are weighted by delivered count.

5. Rate-limit handling.
   - Klaviyo 429 responses are retried up to 3 times.
   - There is a `REPORTING_GAP_MS = 1200` pause between expensive reporting calls.
   - The dashboard API also throttles by `userId:connectionId`: minimum 2 seconds between requests and max 20 requests/minute.

## API Contracts

### Live Analytics

`GET /api/klaviyo/analytics/dashboard`

Query params:

```txt
connectionId=<uuid>
periodStart=2026-04-01
periodEnd=2026-04-30
compStart=2026-03-01
compEnd=2026-03-31
topN=5
includeListGrowth=1
includeAccountOverview=0
```

Success:

```json
{
  "data": {
    "totalRevenue": 12345.67,
    "compTotalRevenue": 10000,
    "attributedRevenue": 4567.89,
    "compAttributedRevenue": 4000,
    "campaigns": [
      {
        "id": "01ABC",
        "name": "Spring Sale",
        "revenue": 1000,
        "openRate": 0.42,
        "clickRate": 0.035,
        "deliveredCount": 12000
      }
    ],
    "compCampaigns": [],
    "flows": [],
    "compFlows": [],
    "activeProfiles": 50000,
    "newSubscribers": 1200,
    "unsubscribers": 200,
    "netGrowth": 1000,
    "netGrowthPercent": 2
  },
  "fetchedAt": "2026-05-07T12:00:00.000Z",
  "source": "live"
}
```

Reconnect/scope response:

```json
{
  "error": "This Klaviyo connection is missing segment permissions required for list growth reports. Delete and reconnect this account from Connections.",
  "errorCode": "managed_segment_scope_required",
  "actionUrl": "/connections",
  "requiresReconnect": true,
  "missingScopes": ["segments:read"]
}
```

### Save Report

`POST /api/reports`

```json
{
  "connectionId": "uuid",
  "title": "Store Name - April 2026 Report",
  "accountLabel": "Store Name",
  "periodStart": "2026-04-01",
  "periodEnd": "2026-04-30",
  "compareStart": "2026-03-01",
  "compareEnd": "2026-03-31",
  "includeListGrowth": true,
  "addSummary": true,
  "includeActionItems": true,
  "includeAccountOverview": false,
  "language": "en",
  "fetchedAt": "2026-05-07T12:00:00.000Z",
  "analyticsData": {}
}
```

Response:

```json
{
  "report": {
    "id": "uuid",
    "title": "Store Name - April 2026 Report",
    "accountLabel": "Store Name",
    "periodStart": "2026-04-01",
    "periodEnd": "2026-04-30",
    "compareStart": "2026-03-01",
    "compareEnd": "2026-03-31",
    "includeListGrowth": true,
    "addSummary": true,
    "includeActionItems": true,
    "includeAccountOverview": false,
    "language": "en",
    "createdAt": "2026-05-07T12:00:00.000Z",
    "status": "ready"
  }
}
```

### Generate AI Insights

`POST /api/reports/:reportId/insights`

```json
{ "force": false }
```

Response:

```json
{
  "insights": {
    "overview": {
      "summary": "string",
      "highlights": ["string"],
      "actionItems": ["string"]
    },
    "campaigns": {
      "summary": "string",
      "highlights": ["string"],
      "actionItems": ["string"]
    },
    "flows": {
      "summary": "string",
      "highlights": ["string"],
      "actionItems": ["string"]
    },
    "listGrowth": {
      "summary": "string",
      "highlights": ["string"],
      "actionItems": ["string"]
    }
  },
  "status": "ready",
  "model": "gemini-2.0-flash",
  "generatedAt": "2026-05-07T12:00:00.000Z",
  "persisted": true
}
```

## UI Flow To Recreate

The current client flow is:

```ts
async function createReport() {
  const analytics = await fetch(`/api/klaviyo/analytics/dashboard?${params}`)
  const saved = await fetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ ...reportOptions, analyticsData: analytics.data }),
  })

  if (includeInsights) {
    await fetch(`/api/reports/${saved.report.id}/insights`, {
      method: 'POST',
      body: JSON.stringify({ force: false }),
    })
  }

  router.push(`/reports/${saved.report.id}`)
}
```

The important UX decision is that AI insight generation is non-fatal. If analytics were fetched and the report was saved, the report exists even if the AI call fails.

## Useful Implementation Details To Reuse

- Save reports as snapshots. Do not re-query Klaviyo every time a saved report is opened.
- Keep analytics fetch live-only unless you need scheduled refreshes. This repo previously had normalized analytics cache tables, then removed them in migration `040_remove_analytics_persistence.sql`.
- Use a service-role Supabase client only for token/connection operations and Klaviyo API calls that need stored OAuth tokens. Use the normal user client for RLS-protected report rows.
- Validate analytics payloads before saving: base numbers must be finite and campaign/flow arrays must exist.
- Put hard limits on date ranges. Current live mode limits current and comparison ranges to 93 days each.
- Cache metric IDs, entity names, active profile counts, and managed segment IDs in memory.
- Add a small delay between Klaviyo reporting endpoints. The current implementation uses 1200ms.
- For rates, aggregate with delivered-count weighting where available.
- Return reconnect/action metadata from APIs so the UI can guide the user to reconnect.
- Let report pages tolerate older schemas during rollout if needed. This app includes fallback queries for month-only reports and missing AI columns.
- Store AI insights separately from analytics data so insights can be regenerated without changing the report snapshot.

## Suggested Minimal Port

For a new app, port in this order:

1. Klaviyo OAuth connection model and token refresh helper.
2. `klaviyoFetch` wrapper with the Klaviyo API revision header.
3. `src/lib/klaviyo-analytics.ts`, adapted to the new app's connection lookup/token helper.
4. `analytics_reports` table.
5. `GET /api/klaviyo/analytics/dashboard`.
6. `POST /api/reports` and report detail loader.
7. Basic UI: create modal, report list, revenue cards, top campaign/flow tables.
8. Optional: list growth managed segment.
9. Optional: AI insights.
10. Optional: account overview charts.
11. Optional: PDF export.

## Prompt For Another Coding Agent

Paste this into the new coding agent after attaching or copying the relevant source files:

```txt
Implement a Klaviyo reporting feature based on the Mauk.AI implementation.

Goal:
- Users can generate saved performance reports for a Klaviyo connection.
- The report compares a selected date range with a comparison date range.
- Fetch data live from Klaviyo once, save a JSON snapshot, and render saved reports from the snapshot.

Required behavior:
- Add an analytics_reports table with RLS/user ownership.
- Add a live analytics endpoint:
  GET /api/klaviyo/analytics/dashboard?connectionId&periodStart&periodEnd&compStart&compEnd&topN&includeListGrowth&includeAccountOverview
- Add a save endpoint:
  POST /api/reports
- Add a report detail page that renders total revenue, Klaviyo attributed revenue, top campaigns, top flows, optional list growth, and optional 12-month account overview.
- Add optional AI insights using a strict JSON schema:
  overview/campaigns/flows/listGrowth, each with summary, highlights, actionItems.

Implementation notes:
- Reuse/adapt the analytics data contract named KlaviyoAnalyticsData.
- Reuse/adapt the Klaviyo aggregation logic from src/lib/klaviyo-analytics.ts.
- Base revenue uses Klaviyo /api/metric-aggregates/ on the Placed Order metric with sum_value.
- Campaign rankings use /api/campaign-values-reports/.
- Flow rankings use /api/flow-values-reports/.
- Optional list growth uses subscribed/unsubscribed metric counts and a managed segment named "Mauk.ai Reporting Segment" for active profile count.
- Optional account overview uses /api/flow-series-reports/, monthly attributed metric aggregates, and campaign value reports for monthly campaign rates.
- Enforce date validation, max 93 days per live range, Klaviyo 429 retries, and a small delay between expensive report API calls.
- Use saved snapshots for report detail pages; do not fetch Klaviyo when opening an existing report.
- AI insight generation should be non-fatal after the report is saved.

Port carefully:
- Replace Supabase helpers, auth checks, and connection access checks with this app's equivalents.
- Preserve token refresh locking and Klaviyo API revision headers.
- Preserve scope handling: metrics:read required, segments:read/segments:write for list growth, campaigns:read/flows:read for account overview.
- Keep generated insights and report title editable independently from analytics_data.
```

## Files Worth Copying First

These are the most portable files:

- `src/lib/klaviyo-analytics.ts`
- `src/lib/report-dates.ts`
- `src/lib/report-insights.ts`
- `src/lib/ai/types.ts`
- `src/app/api/klaviyo/analytics/dashboard/route.ts`
- `src/app/api/reports/route.ts`
- `src/app/api/reports/[reportId]/insights/route.ts`
- `src/components/analytics/revenue-cards.tsx`
- `src/components/analytics/top-campaigns.tsx`
- `src/components/analytics/top-flows.tsx`
- `src/components/analytics/account-overview-charts.tsx`
- `src/lib/report-pdf.ts`

Expect to rewrite imports, auth wrappers, database clients, and UI primitives. The analytics service and data contract are the real reusable core.
