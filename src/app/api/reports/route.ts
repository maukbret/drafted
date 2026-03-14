import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { KlaviyoAnalyticsData } from '@/types/database'
import { SavedReportListItem } from '@/types/reports'
import { isMissingReportRangeColumnsError, resolveRangeWithMonthFallback } from '@/lib/report-dates'
import { canAccessReports } from '@/lib/feature-access'

interface CreateReportPayload {
  connectionId?: string
  title?: string
  accountLabel?: string
  periodStart?: string
  periodEnd?: string
  compareStart?: string
  compareEnd?: string
  periodMonth?: string
  compareMonth?: string
  includeListGrowth?: boolean
  addSummary?: boolean
  includeActionItems?: boolean
  includeAccountOverview?: boolean
  language?: string
  fetchedAt?: string
  analyticsData?: KlaviyoAnalyticsData
}

interface InsertedReportRow {
  id: string
  title: string
  account_label: string
  period_start?: string | null
  period_end?: string | null
  compare_start?: string | null
  compare_end?: string | null
  period_month: string | null
  compare_month: string | null
  include_list_growth: boolean
  add_summary: boolean
  include_action_items: boolean
  include_account_overview: boolean
  language: string
  created_at: string
  status: string
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

export async function POST(request: NextRequest) {
  try {
    let body: CreateReportPayload = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const {
      connectionId,
      title,
      accountLabel,
      periodStart,
      periodEnd,
      compareStart,
      compareEnd,
      periodMonth,
      compareMonth,
      includeListGrowth,
      addSummary,
      includeActionItems,
      includeAccountOverview,
      language,
      fetchedAt,
      analyticsData,
    } = body

    if (!connectionId || !title || !accountLabel || !analyticsData) {
      return NextResponse.json({ error: 'Missing required report fields.' }, { status: 400 })
    }

    const periodRange = resolveRangeWithMonthFallback(periodStart, periodEnd, periodMonth)
    const compareRange = resolveRangeWithMonthFallback(compareStart, compareEnd, compareMonth)
    if (!periodRange || !compareRange) {
      return NextResponse.json(
        { error: 'Invalid report range. Provide start and end dates in YYYY-MM-DD format.' },
        { status: 400 }
      )
    }

    if (!isKlaviyoAnalyticsData(analyticsData)) {
      return NextResponse.json({ error: 'Invalid analytics payload.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canAccessReports(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const insertedWithRange = await supabase
      .from('analytics_reports')
      .insert({
        user_id: user.id,
        connection_id: connectionId,
        title,
        account_label: accountLabel,
        period_start: periodRange.start,
        period_end: periodRange.end,
        compare_start: compareRange.start,
        compare_end: compareRange.end,
        period_month: periodRange.start.slice(0, 7),
        compare_month: compareRange.start.slice(0, 7),
        include_list_growth: includeListGrowth === true,
        add_summary: addSummary !== false,
        include_action_items: includeActionItems !== false,
        include_account_overview: includeAccountOverview === true,
        language: language === 'nl' ? 'nl' : 'en',
        status: 'ready',
        analytics_data: analyticsData,
        fetched_at: fetchedAt || new Date().toISOString(),
      })
      .select('id, title, account_label, period_start, period_end, compare_start, compare_end, period_month, compare_month, include_list_growth, add_summary, include_action_items, include_account_overview, language, created_at, status')
      .single()

    let inserted: InsertedReportRow | null = insertedWithRange.data as InsertedReportRow | null
    let error = insertedWithRange.error

    if (error && isMissingReportRangeColumnsError(error)) {
      console.warn('[Reports] analytics_reports range columns missing. Falling back to month-only insert.')

      const fallbackInsert = await supabase
        .from('analytics_reports')
        .insert({
          user_id: user.id,
          connection_id: connectionId,
          title,
          account_label: accountLabel,
          period_month: periodRange.start.slice(0, 7),
          compare_month: compareRange.start.slice(0, 7),
          include_list_growth: includeListGrowth === true,
          add_summary: addSummary !== false,
          include_action_items: includeActionItems !== false,
          include_account_overview: includeAccountOverview === true,
          language: language === 'nl' ? 'nl' : 'en',
          status: 'ready',
          analytics_data: analyticsData,
          fetched_at: fetchedAt || new Date().toISOString(),
        })
        .select('id, title, account_label, period_month, compare_month, include_list_growth, add_summary, include_action_items, include_account_overview, language, created_at, status')
        .single()

      inserted = fallbackInsert.data as InsertedReportRow | null
      error = fallbackInsert.error
    }

    if (error || !inserted) {
      console.error('Create analytics report error:', error)
      return NextResponse.json({ error: 'Failed to save report output.' }, { status: 500 })
    }

    const insertedPeriod = resolveRangeWithMonthFallback(
      inserted.period_start,
      inserted.period_end,
      inserted.period_month
    )
    const insertedCompare = resolveRangeWithMonthFallback(
      inserted.compare_start,
      inserted.compare_end,
      inserted.compare_month
    )
    if (!insertedPeriod || !insertedCompare) {
      return NextResponse.json({ error: 'Saved report range is invalid.' }, { status: 500 })
    }

    const report: SavedReportListItem = {
      id: inserted.id,
      title: inserted.title,
      accountLabel: inserted.account_label,
      periodStart: insertedPeriod.start,
      periodEnd: insertedPeriod.end,
      compareStart: insertedCompare.start,
      compareEnd: insertedCompare.end,
      includeListGrowth: inserted.include_list_growth,
      addSummary: inserted.add_summary,
      includeActionItems: inserted.include_action_items,
      includeAccountOverview: inserted.include_account_overview ?? false,
      language: inserted.language || 'en',
      createdAt: inserted.created_at,
      status: inserted.status === 'ready' ? 'ready' : 'ready',
    }

    return NextResponse.json({ report })
  } catch (err) {
    console.error('Create analytics report error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
