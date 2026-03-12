'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, ChevronLeft, Download, Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RevenueCards } from '@/components/analytics/revenue-cards'
import { TopCampaigns } from '@/components/analytics/top-campaigns'
import { TopFlows } from '@/components/analytics/top-flows'
import { SavedReportDetail } from '@/types/reports'
import { formatRangeLabel } from '@/lib/report-dates'
import { Checkbox } from '@/components/ui/checkbox'
import { ReportInsightSection, ReportInsights } from '@/lib/report-insights'
import { generateReportPdf } from '@/lib/report-pdf'

interface ReportDetailPageProps {
  report: SavedReportDetail
}

function formatInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

function formatSignedInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`
}

function formatSignedPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

interface UpdateTitleApiResponse {
  id?: string
  title?: string
  error?: string
}

interface GenerateInsightsApiResponse {
  insights?: ReportInsights
  status?: 'ready'
  model?: string | null
  generatedAt?: string | null
  warning?: string | null
  error?: string
}

interface InsightCardProps {
  title: string
  section: ReportInsightSection | null
  sectionKey: string
  excludedActionItems: Set<string>
  onToggleActionItem: (key: string) => void
}

function InsightCard({ title, section, sectionKey, excludedActionItems, onToggleActionItem }: InsightCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {section?.summary || 'No insight generated yet.'}
        </p>

        {section && section.highlights.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {section.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {section && section.actionItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action items</p>
            <ul className="mt-2 space-y-2 pl-1 text-sm">
              {section.actionItems.map((item, index) => {
                const itemKey = `${sectionKey}-${index}`
                const isExcluded = excludedActionItems.has(itemKey)
                return (
                  <li key={itemKey} className="flex items-start gap-2">
                    <Checkbox
                      id={itemKey}
                      checked={!isExcluded}
                      onCheckedChange={() => onToggleActionItem(itemKey)}
                      className="mt-0.5 shrink-0"
                    />
                    <label
                      htmlFor={itemKey}
                      className={`cursor-pointer leading-snug transition-opacity ${isExcluded ? 'opacity-50 line-through' : ''}`}
                    >
                      {item}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportDetailPage({ report }: ReportDetailPageProps) {
  const [title, setTitle] = useState(report.title)
  const [draftTitle, setDraftTitle] = useState(report.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [insights, setInsights] = useState<ReportInsights | null>(report.aiInsights)
  const [aiStatus, setAiStatus] = useState(report.aiStatus)
  const [aiModel, setAiModel] = useState<string | null>(report.aiModel)
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(report.aiGeneratedAt)
  const [aiError, setAiError] = useState<string | null>(report.aiError)
  const [insightsWarning, setInsightsWarning] = useState<string | null>(null)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [excludedActionItems, setExcludedActionItems] = useState<Set<string>>(new Set())

  const toggleActionItem = (key: string) => {
    setExcludedActionItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const optionLabels = [
    report.includeListGrowth ? 'List growth' : null,
    report.addSummary ? 'Summary' : null,
    report.includeActionItems ? 'Actionable to-do' : null,
    report.language === 'nl' ? '🇳🇱 Nederlands' : '🇺🇸 English',
  ].filter(Boolean) as string[]

  const hasGrowthMetrics = (
    report.analytics.activeProfiles != null
    || report.analytics.newSubscribers != null
    || report.analytics.unsubscribers != null
    || report.analytics.netGrowth != null
    || report.analytics.netGrowthPercent != null
  )
  const showListGrowthSection = hasGrowthMetrics || report.includeListGrowth || !!insights?.listGrowth

  const periodLabel = formatRangeLabel(report.periodStart, report.periodEnd)
  const compareLabel = formatRangeLabel(report.compareStart, report.compareEnd)

  const generateInsights = async () => {
    setIsGeneratingInsights(true)
    setAiError(null)
    setInsightsWarning(null)
    setAiStatus('generating')

    try {
      const response = await fetch(`/api/reports/${report.id}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: !!insights }),
      })

      let json: GenerateInsightsApiResponse = {}
      try {
        json = (await response.json()) as GenerateInsightsApiResponse
      } catch {
        json = {}
      }

      if (!response.ok || json.error || !json.insights) {
        throw new Error(json.error || 'Failed to generate insights.')
      }

      setInsights(json.insights)
      setAiStatus('ready')
      setAiModel(json.model || null)
      setAiGeneratedAt(json.generatedAt || new Date().toISOString())
      setAiError(null)
      setInsightsWarning(json.warning || null)
    } catch (error) {
      const message = (error as Error)?.message || 'Failed to generate insights.'
      setAiStatus('failed')
      setAiError(message)
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  const exportPdf = () => {
    generateReportPdf({
      report: { ...report, title },
      insights,
      periodLabel,
      compareLabel,
      excludedActionItems,
      showListGrowthSection,
      hasGrowthMetrics,
    })
  }

  const saveTitle = async () => {
    const nextTitle = draftTitle.trim()

    if (!nextTitle) {
      setTitleError('Report title cannot be empty.')
      return
    }
    if (nextTitle.length > 120) {
      setTitleError('Report title must be 120 characters or less.')
      return
    }
    if (nextTitle === title) {
      setIsEditingTitle(false)
      setTitleError(null)
      return
    }

    setIsSavingTitle(true)
    setTitleError(null)

    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      })

      let json: UpdateTitleApiResponse = {}
      try {
        json = (await response.json()) as UpdateTitleApiResponse
      } catch {
        json = {}
      }

      if (!response.ok || json.error || !json.title) {
        throw new Error(json.error || 'Failed to update report title.')
      }

      setTitle(json.title)
      setDraftTitle(json.title)
      setIsEditingTitle(false)
    } catch (error) {
      setTitleError((error as Error)?.message || 'Failed to update report title.')
    } finally {
      setIsSavingTitle(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="pl-1 text-muted-foreground">
          <Link href="/reports">
            <ChevronLeft className="h-4 w-4 buttonIcon" />
            Back to reports
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {isEditingTitle ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void saveTitle()
                    }
                    if (event.key === 'Escape') {
                      setDraftTitle(title)
                      setTitleError(null)
                      setIsEditingTitle(false)
                    }
                  }}
                  disabled={isSavingTitle}
                  className="h-10 min-w-[260px] text-lg font-semibold"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveTitle()}
                  disabled={isSavingTitle}
                >
                  <Check className="h-4 w-4 buttonIcon" />
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftTitle(title)
                    setTitleError(null)
                    setIsEditingTitle(false)
                  }}
                  disabled={isSavingTitle}
                >
                  <X className="h-4 w-4 buttonIcon" />
                  Cancel
                </Button>
              </div>
              {titleError && (
                <p className="text-sm text-red-600">{titleError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftTitle(title)
                setTitleError(null)
                setIsEditingTitle(true)
              }}
              className="group inline-flex items-center gap-2 text-left"
              aria-label="Edit report title"
            >
              <h1 className="text-2xl font-bold">{title}</h1>
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {report.accountLabel} · {periodLabel} vs {compareLabel}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {optionLabels.length > 0 ? (
              optionLabels.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Base metrics only</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Generated {new Date(report.createdAt).toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void generateInsights()}
              disabled={isGeneratingInsights || aiStatus === 'generating'}
            >
              {isGeneratingInsights || aiStatus === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin buttonIcon" />
                  Generating insights
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 buttonIcon" />
                  {insights ? 'Regenerate insights' : 'Generate insights'}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportPdf}
            >
              <Download className="h-4 w-4 buttonIcon" />
              Export PDF
            </Button>
            {aiStatus === 'ready' && aiGeneratedAt && (
              <span className="text-xs text-muted-foreground">
                Updated {new Date(aiGeneratedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {aiModel ? ` · ${aiModel}` : ''}
              </span>
            )}
          </div>
          {aiError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {aiError}
            </p>
          )}
          {insightsWarning && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {insightsWarning}
            </p>
          )}
        </CardContent>
      </Card>

      <RevenueCards
        totalRevenue={report.analytics.totalRevenue}
        compTotalRevenue={report.analytics.compTotalRevenue}
        attributedRevenue={report.analytics.attributedRevenue}
        compAttributedRevenue={report.analytics.compAttributedRevenue}
      />
      <InsightCard
        title="Insights: Revenue overview"
        section={insights?.overview || null}
        sectionKey="overview"
        excludedActionItems={excludedActionItems}
        onToggleActionItem={toggleActionItem}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <TopCampaigns
            campaigns={report.analytics.campaigns}
            compCampaigns={report.analytics.compCampaigns}
            periodLabel={`${periodLabel} vs ${compareLabel}`}
          />
          <InsightCard
            title="Insights: Campaign performance"
            section={insights?.campaigns || null}
            sectionKey="campaigns"
            excludedActionItems={excludedActionItems}
            onToggleActionItem={toggleActionItem}
          />
        </div>
        <div className="space-y-4">
          <TopFlows
            flows={report.analytics.flows}
            compFlows={report.analytics.compFlows}
            periodLabel={`${periodLabel} vs ${compareLabel}`}
          />
          <InsightCard
            title="Insights: Flow performance"
            section={insights?.flows || null}
            sectionKey="flows"
            excludedActionItems={excludedActionItems}
            onToggleActionItem={toggleActionItem}
          />
        </div>
      </div>

      {showListGrowthSection && (
        <div className="space-y-4">
          {hasGrowthMetrics ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Audience Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Total profiles</p>
                    <p className="mt-1 text-lg font-semibold">{formatInteger(report.analytics.activeProfiles)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">New subscribers</p>
                    <p className="mt-1 text-lg font-semibold">{formatInteger(report.analytics.newSubscribers)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Unsubscribers</p>
                    <p className="mt-1 text-lg font-semibold">{formatInteger(report.analytics.unsubscribers)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Net growth</p>
                    <p className="mt-1 text-lg font-semibold">{formatSignedInteger(report.analytics.netGrowth)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Net growth %</p>
                    <p className="mt-1 text-lg font-semibold">{formatSignedPercent(report.analytics.netGrowthPercent)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Audience Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Audience growth metrics were not included in this report.
                </p>
              </CardContent>
            </Card>
          )}
          <InsightCard
            title="Insights: List growth"
            section={insights?.listGrowth || null}
            sectionKey="listGrowth"
            excludedActionItems={excludedActionItems}
            onToggleActionItem={toggleActionItem}
          />
        </div>
      )}
    </div>
  )
}
