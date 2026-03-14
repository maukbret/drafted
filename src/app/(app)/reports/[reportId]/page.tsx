import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccessReports } from '@/lib/feature-access'
import { KlaviyoAnalyticsData } from '@/types/database'
import { SavedReportDetail } from '@/types/reports'
import { ReportDetailPage } from '@/components/report-detail-page'
import { isMissingReportRangeColumnsError, resolveRangeWithMonthFallback } from '@/lib/report-dates'
import {
  isMissingReportInsightsColumnsError,
  isReportAiStatus,
  normalizeReportInsights,
} from '@/lib/report-insights'

interface ReportDetailRouteProps {
  params: Promise<{ reportId: string }>
}

interface ReportDetailRow {
  id: string
  connection_id: string | null
  title: string
  account_label: string
  period_start?: string | null
  period_end?: string | null
  compare_start?: string | null
  compare_end?: string | null
  period_month?: string | null
  compare_month?: string | null
  include_list_growth: boolean
  add_summary: boolean
  include_action_items: boolean
  include_account_overview?: boolean
  language?: string | null
  created_at: string
  fetched_at: string
  status: string
  analytics_data: unknown
  ai_status?: string | null
  ai_insights?: unknown
  ai_model?: string | null
  ai_generated_at?: string | null
  ai_error?: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isKlaviyoAnalyticsData(value: unknown): value is KlaviyoAnalyticsData {
  if (!isObject(value)) return false

  const hasNumbers = [
    value.totalRevenue,
    value.compTotalRevenue,
    value.attributedRevenue,
    value.compAttributedRevenue,
  ].every((num) => typeof num === 'number' && Number.isFinite(num))

  if (!hasNumbers) return false

  return Array.isArray(value.campaigns)
    && Array.isArray(value.compCampaigns)
    && Array.isArray(value.flows)
    && Array.isArray(value.compFlows)
}

function isSchemaMissingColumnError(error: unknown): boolean {
  return isMissingReportRangeColumnsError(error) || isMissingReportInsightsColumnsError(error)
}

async function loadReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
  userId: string
): Promise<ReportDetailRow | null> {
  const queryVariants = [
    'id, connection_id, title, account_label, period_start, period_end, compare_start, compare_end, period_month, compare_month, include_list_growth, add_summary, include_action_items, include_account_overview, language, created_at, fetched_at, status, analytics_data, ai_status, ai_insights, ai_model, ai_generated_at, ai_error',
    'id, connection_id, title, account_label, period_start, period_end, compare_start, compare_end, period_month, compare_month, include_list_growth, add_summary, include_action_items, language, created_at, fetched_at, status, analytics_data, ai_status, ai_insights, ai_model, ai_generated_at, ai_error',
    'id, connection_id, title, account_label, period_start, period_end, compare_start, compare_end, period_month, compare_month, include_list_growth, add_summary, include_action_items, language, created_at, fetched_at, status, analytics_data',
    'id, connection_id, title, account_label, period_month, compare_month, include_list_growth, add_summary, include_action_items, language, created_at, fetched_at, status, analytics_data, ai_status, ai_insights, ai_model, ai_generated_at, ai_error',
    'id, connection_id, title, account_label, period_month, compare_month, include_list_growth, add_summary, include_action_items, language, created_at, fetched_at, status, analytics_data',
  ]

  for (const fields of queryVariants) {
    const result = await supabase
      .from('analytics_reports')
      .select(fields)
      .eq('id', reportId)
      .eq('user_id', userId)
      .single()

    if (!result.error && result.data) {
      return result.data as unknown as ReportDetailRow
    }

    if (!isSchemaMissingColumnError(result.error)) {
      return null
    }
  }

  return null
}

export default async function ReportDetailRoute({ params }: ReportDetailRouteProps) {
  const { reportId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!canAccessReports(user.id)) redirect('/campaigns')

  const row = await loadReport(supabase, reportId, user.id)
  if (!row || !isKlaviyoAnalyticsData(row.analytics_data)) {
    notFound()
  }

  const periodRange = resolveRangeWithMonthFallback(row.period_start, row.period_end, row.period_month)
  const compareRange = resolveRangeWithMonthFallback(row.compare_start, row.compare_end, row.compare_month)
  if (!periodRange || !compareRange) {
    notFound()
  }

  const aiInsights = normalizeReportInsights(row.ai_insights)
  const aiStatus = isReportAiStatus(row.ai_status) ? row.ai_status : (aiInsights ? 'ready' : 'idle')

  const report: SavedReportDetail = {
    id: row.id,
    connectionId: row.connection_id,
    title: row.title,
    accountLabel: row.account_label,
    periodStart: periodRange.start,
    periodEnd: periodRange.end,
    compareStart: compareRange.start,
    compareEnd: compareRange.end,
    includeListGrowth: row.include_list_growth,
    addSummary: row.add_summary,
    includeActionItems: row.include_action_items,
    includeAccountOverview: row.include_account_overview ?? false,
    language: row.language || 'en',
    createdAt: row.created_at,
    fetchedAt: row.fetched_at,
    status: row.status === 'ready' ? 'ready' : 'ready',
    analytics: row.analytics_data,
    aiStatus,
    aiInsights,
    aiModel: row.ai_model || null,
    aiGeneratedAt: row.ai_generated_at || null,
    aiError: row.ai_error || null,
  }

  return (
    <div className="p-8">
      <ReportDetailPage report={report} />
    </div>
  )
}
