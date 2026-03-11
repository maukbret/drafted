import { KlaviyoAnalyticsData } from '@/types/database'
import { ReportAIStatus, ReportInsights } from '@/lib/report-insights'

export type ReportStatus = 'ready'

export interface SavedReportListItem {
  id: string
  title: string
  accountLabel: string
  periodStart: string
  periodEnd: string
  compareStart: string
  compareEnd: string
  includeListGrowth: boolean
  addSummary: boolean
  includeActionItems: boolean
  createdAt: string
  status: ReportStatus
}

export interface SavedReportDetail extends SavedReportListItem {
  connectionId: string | null
  fetchedAt: string
  analytics: KlaviyoAnalyticsData
  aiStatus: ReportAIStatus
  aiInsights: ReportInsights | null
  aiModel: string | null
  aiGeneratedAt: string | null
  aiError: string | null
}
