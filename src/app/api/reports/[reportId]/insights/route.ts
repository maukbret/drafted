import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { formatRangeLabel, resolveRangeWithMonthFallback } from '@/lib/report-dates'
import { generateReportInsights } from '@/lib/ai/gemini'
import {
  isMissingReportInsightsColumnsError,
  normalizeReportInsights,
  ReportInsights,
} from '@/lib/report-insights'
import { KlaviyoAnalyticsData } from '@/types/database'
import { canAccessReports } from '@/lib/feature-access'

interface RouteParams {
  params: Promise<{ reportId: string }>
}

interface GenerateInsightsPayload {
  force?: boolean
}

interface ReportRow {
  id: string
  title: string
  account_label: string
  user_id: string
  include_list_growth: boolean
  period_start?: string | null
  period_end?: string | null
  compare_start?: string | null
  compare_end?: string | null
  period_month?: string | null
  compare_month?: string | null
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
  if (!error || typeof error !== 'object') return false
  const maybe = error as { code?: string | null }
  return maybe.code === 'PGRST204'
}

async function loadReportForInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
  userId: string
): Promise<{ row: ReportRow; supportsAiColumns: boolean } | { error: unknown }> {
  const variants: Array<{ fields: string; supportsAiColumns: boolean }> = [
    {
      fields: 'id, user_id, title, account_label, include_list_growth, period_start, period_end, compare_start, compare_end, period_month, compare_month, analytics_data, ai_status, ai_insights, ai_model, ai_generated_at, ai_error',
      supportsAiColumns: true,
    },
    {
      fields: 'id, user_id, title, account_label, include_list_growth, period_start, period_end, compare_start, compare_end, period_month, compare_month, analytics_data',
      supportsAiColumns: false,
    },
    {
      fields: 'id, user_id, title, account_label, include_list_growth, period_month, compare_month, analytics_data, ai_status, ai_insights, ai_model, ai_generated_at, ai_error',
      supportsAiColumns: true,
    },
    {
      fields: 'id, user_id, title, account_label, include_list_growth, period_month, compare_month, analytics_data',
      supportsAiColumns: false,
    },
  ]

  let lastError: unknown = null

  for (const variant of variants) {
    const result = await supabase
      .from('analytics_reports')
      .select(variant.fields)
      .eq('id', reportId)
      .eq('user_id', userId)
      .single()

    if (!result.error && result.data) {
      return {
        row: result.data as unknown as ReportRow,
        supportsAiColumns: variant.supportsAiColumns,
      }
    }

    lastError = result.error
    if (!isSchemaMissingColumnError(result.error)) {
      return { error: result.error }
    }
  }

  return { error: lastError }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { reportId } = await params

    let body: GenerateInsightsPayload = {}
    try {
      body = (await request.json()) as GenerateInsightsPayload
    } catch {
      body = {}
    }
    const force = body.force === true

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canAccessReports(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const loaded = await loadReportForInsights(supabase, reportId, user.id)
    if ('error' in loaded) {
      const status = (loaded.error as { code?: string | null })?.code === 'PGRST116' ? 404 : 500
      return NextResponse.json({ error: status === 404 ? 'Report not found.' : 'Failed to load report.' }, { status })
    }

    const { row, supportsAiColumns } = loaded
    if (!isKlaviyoAnalyticsData(row.analytics_data)) {
      return NextResponse.json({ error: 'Invalid report analytics payload.' }, { status: 400 })
    }

    const periodRange = resolveRangeWithMonthFallback(row.period_start, row.period_end, row.period_month)
    const compareRange = resolveRangeWithMonthFallback(row.compare_start, row.compare_end, row.compare_month)
    if (!periodRange || !compareRange) {
      return NextResponse.json({ error: 'Report date range is invalid.' }, { status: 400 })
    }

    const existingInsights = normalizeReportInsights(row.ai_insights)
    if (existingInsights && !force) {
      return NextResponse.json({
        insights: existingInsights,
        status: 'ready',
        model: row.ai_model || null,
        generatedAt: row.ai_generated_at || null,
        cached: true,
        persisted: supportsAiColumns,
      })
    }

    const lastGeneratedAt = row.ai_generated_at ? Date.parse(row.ai_generated_at) : NaN
    if (force && Number.isFinite(lastGeneratedAt) && Date.now() - lastGeneratedAt < 15_000) {
      return NextResponse.json({ error: 'Please wait a few seconds before regenerating insights.' }, { status: 429 })
    }

    const serviceClient = createServiceClient()
    if (supportsAiColumns) {
      const { error: markGeneratingError } = await serviceClient
        .from('analytics_reports')
        .update({
          ai_status: 'generating',
          ai_error: null,
        })
        .eq('id', reportId)
        .eq('user_id', user.id)

      if (markGeneratingError && !isMissingReportInsightsColumnsError(markGeneratingError)) {
        console.error('Failed to mark report insights as generating:', markGeneratingError)
      }
    }

    let insights: ReportInsights
    let model: string
    try {
      const result = await generateReportInsights({
        reportTitle: row.title,
        accountLabel: row.account_label,
        periodLabel: formatRangeLabel(periodRange.start, periodRange.end),
        compareLabel: formatRangeLabel(compareRange.start, compareRange.end),
        includeListGrowth: row.include_list_growth,
        analytics: row.analytics_data,
      })
      insights = result.insights
      model = result.model
    } catch (error) {
      const message = (error as Error)?.message || 'Failed to generate insights.'

      if (supportsAiColumns) {
        await serviceClient
          .from('analytics_reports')
          .update({
            ai_status: 'failed',
            ai_error: message,
          })
          .eq('id', reportId)
          .eq('user_id', user.id)
      }

      return NextResponse.json({ error: message }, { status: 502 })
    }

    const generatedAt = new Date().toISOString()
    let persisted = false
    let persistenceWarning: string | null = null

    if (supportsAiColumns) {
      const { error: persistError } = await serviceClient
        .from('analytics_reports')
        .update({
          ai_status: 'ready',
          ai_insights: insights,
          ai_model: model,
          ai_generated_at: generatedAt,
          ai_error: null,
        })
        .eq('id', reportId)
        .eq('user_id', user.id)

      if (persistError) {
        if (isMissingReportInsightsColumnsError(persistError)) {
          persistenceWarning = 'Insights generated but not saved. Run the latest analytics report migration.'
        } else {
          console.error('Failed to persist generated insights:', persistError)
          persistenceWarning = 'Insights generated but failed to save.'
        }
      } else {
        persisted = true
      }
    } else {
      persistenceWarning = 'Insights generated but not saved. Run the latest analytics report migration.'
    }

    return NextResponse.json({
      insights,
      status: 'ready',
      model,
      generatedAt,
      persisted,
      warning: persistenceWarning,
    })
  } catch (error) {
    console.error('Generate report insights error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
