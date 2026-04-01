import { createClient } from '@/lib/supabase/server'
import { canAccessReports } from '@/lib/feature-access'
import { redirect } from 'next/navigation'
import { ReportsPageClient } from '@/components/reports-page-client'
import { SavedReportListItem } from '@/types/reports'
import { isMissingReportRangeColumnsError, resolveRangeWithMonthFallback } from '@/lib/report-dates'

interface AnalyticsReportRow {
  id: string
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
  status: string
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!canAccessReports(user.id)) redirect('/campaigns')

  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single()

  const { data: ownConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, store_url, scope')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  let teamConnections: typeof ownConnections = []
  if (teamMembership?.role === 'admin') {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamMembership.team_id)
      .single()

    const { data: teammates } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .neq('user_id', user.id)

    const teammateIds = teammates?.map((m) => m.user_id) || []
    if (teammateIds.length > 0) {
      const { data: tc } = await supabase
        .from('klaviyo_connections')
        .select('id, account_name, store_url, scope')
        .in('user_id', teammateIds)
        .order('created_at', { ascending: false })

      const ownerName = team?.name || 'Team'
      teamConnections = (tc || []).map((conn) => ({
        ...conn,
        owner_name: ownerName,
      }))
    }
  }

  const allConnections = [
    ...(ownConnections || []),
    ...(teamConnections || []),
  ]

  const reportsWithRange = await supabase
    .from('analytics_reports')
    .select('id, title, account_label, period_start, period_end, compare_start, compare_end, period_month, compare_month, include_list_growth, add_summary, include_action_items, language, created_at, status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  let reportRows = reportsWithRange.data as AnalyticsReportRow[] | null
  let reportsError = reportsWithRange.error

  if (reportsError && isMissingReportRangeColumnsError(reportsError)) {
    console.warn('[Reports] analytics_reports range columns missing. Falling back to month-only query.')
    const fallbackReports = await supabase
      .from('analytics_reports')
      .select('id, title, account_label, period_month, compare_month, include_list_growth, add_summary, include_action_items, language, created_at, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    reportRows = fallbackReports.data as AnalyticsReportRow[] | null
    reportsError = fallbackReports.error
  }

  if (reportsError) {
    console.error('Failed to load analytics reports:', reportsError)
  }

  const initialReports: SavedReportListItem[] = ((reportRows || []) as AnalyticsReportRow[]).flatMap((row) => {
    const periodRange = resolveRangeWithMonthFallback(row.period_start, row.period_end, row.period_month)
    const compareRange = resolveRangeWithMonthFallback(row.compare_start, row.compare_end, row.compare_month)
    if (!periodRange || !compareRange) return []

    return [{
      id: row.id,
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
      status: row.status === 'ready' ? 'ready' : 'ready',
    }]
  })

  return (
    <div className="p-8">
      <ReportsPageClient connections={allConnections} initialReports={initialReports} />
    </div>
  )
}
