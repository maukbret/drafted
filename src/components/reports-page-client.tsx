'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Calendar, ChevronRight, FileText, Plus, Sparkles } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { BrandIcon } from '@/components/brand-icon'
import { GenerationStepRow, getStepStatus, type StepStatus, type GenerationStep } from '@/components/generation-step-row'
import { KlaviyoAnalyticsData } from '@/types/database'
import { SavedReportListItem } from '@/types/reports'
import { formatRangeLabel, toIsoDate } from '@/lib/report-dates'

interface Connection {
  id: string
  account_name: string | null
  store_url: string | null
  scope: string
  owner_name?: string
}

interface ReportsPageClientProps {
  connections: Connection[]
  initialReports: SavedReportListItem[]
}

interface DashboardApiResponse {
  data?: KlaviyoAnalyticsData
  fetchedAt?: string
  error?: string
  errorCode?: string
  actionUrl?: string
  requiresReconnect?: boolean
  retryAfterSeconds?: number
}

interface CreateReportApiResponse {
  report?: SavedReportListItem
  error?: string
}

interface InsightsApiResponse {
  insights?: unknown
  status?: string
  error?: string
}

type ReportsView = 'overview' | 'generating'

interface GenerationErrorState {
  message: string
  actionUrl?: string
  actionLabel?: string
}

const REPORT_TOP_N = 5

function getGenerationSteps(options: {
  includeListGrowth: boolean
  includeAccountOverview: boolean
  includeInsights: boolean
}): GenerationStep[] {
  const steps: GenerationStep[] = [
    {
      id: 'prepare',
      label: 'Preparing request',
      description: 'Setting up your report parameters',
    },
    {
      id: 'campaigns',
      label: 'Fetching campaign data',
      description: 'Pulling campaign performance from Klaviyo',
    },
    {
      id: 'flows',
      label: 'Fetching flow data',
      description: 'Pulling flow performance from Klaviyo',
    },
  ]

  if (options.includeListGrowth) {
    steps.push({
      id: 'list-growth',
      label: 'Fetching list growth',
      description: 'Counting subscribers and profile changes',
    })
  }

  if (options.includeAccountOverview) {
    steps.push({
      id: 'account-overview',
      label: 'Fetching account overview',
      description: 'Loading 12-month trend data for campaigns and flows',
    })
  }

  steps.push({
    id: 'saving',
    label: 'Saving report',
    description: 'Storing your report data',
  })

  if (options.includeInsights) {
    steps.push({
      id: 'insights',
      label: 'Generating insights',
      description: 'Creating summary, highlights, and action items',
    })
  }

  steps.push({
    id: 'complete',
    label: 'Opening your report',
    description: 'Redirecting to your new report',
  })

  return steps
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function accountLabel(connection: Connection | undefined): string {
  if (!connection) return 'Unknown account'
  const accountName = connection.account_name || 'Unnamed account'
  return connection.owner_name ? `${accountName} (${connection.owner_name})` : accountName
}

function defaultMonthRange(monthOffsetFromCurrent: number): DateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffsetFromCurrent, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffsetFromCurrent + 1, 0)
  return { from: start, to: end }
}

function toRangePayload(value: DateRange | undefined): { start: string; end: string } | null {
  if (!value?.from || !value?.to) return null
  return {
    start: toIsoDate(value.from),
    end: toIsoDate(value.to),
  }
}

interface ReportAccountSelectorProps {
  connections: Connection[]
  selectedConnectionId: string
  onSelect: (connectionId: string) => void
  disabled?: boolean
}

function ReportAccountSelector({
  connections,
  selectedConnectionId,
  onSelect,
  disabled,
}: ReportAccountSelectorProps) {
  const [open, setOpen] = useState(false)
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId)
  const ownConnections = connections.filter((c) => !c.owner_name)
  const teamConnections = connections.filter((c) => !!c.owner_name)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selectedConnection ? accountLabel(selectedConnection) : 'Select a Klaviyo account'}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">Select</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            {ownConnections.length > 0 && (
              <CommandGroup heading={teamConnections.length > 0 ? 'Your accounts' : undefined}>
                {ownConnections.map((conn) => (
                  <CommandItem
                    key={conn.id}
                    value={conn.account_name || 'Unnamed account'}
                    onSelect={() => {
                      onSelect(conn.id)
                      setOpen(false)
                    }}
                  >
                    {conn.account_name || 'Unnamed account'}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {teamConnections.length > 0 && (
              <CommandGroup heading="Team accounts">
                {teamConnections.map((conn) => (
                  <CommandItem
                    key={conn.id}
                    value={`${conn.account_name || 'Unnamed account'} ${conn.owner_name || ''}`}
                    onSelect={() => {
                      onSelect(conn.id)
                      setOpen(false)
                    }}
                  >
                    <span>{conn.account_name || 'Unnamed account'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({conn.owner_name || 'Team'})
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ReportsPageClient({ connections, initialReports }: ReportsPageClientProps) {
  const router = useRouter()

  const defaultPeriodRange = useMemo(() => defaultMonthRange(-1), [])
  const defaultCompareRange = useMemo(() => defaultMonthRange(-2), [])

  const [reports, setReports] = useState<SavedReportListItem[]>(initialReports)
  const [modalOpen, setModalOpen] = useState(false)
  const [view, setView] = useState<ReportsView>('overview')
  const [connectionId, setConnectionId] = useState(connections[0]?.id || '')
  const [periodRange, setPeriodRange] = useState<DateRange | undefined>(defaultPeriodRange)
  const [compareRange, setCompareRange] = useState<DateRange | undefined>(defaultCompareRange)
  const [includeListGrowth, setIncludeListGrowth] = useState(true)
  const [addSummary, setAddSummary] = useState(false)
  const [includeActionItems, setIncludeActionItems] = useState(false)
  const [includeAccountOverview, setIncludeAccountOverview] = useState(false)
  const [language, setLanguage] = useState('en')
  const [formError, setFormError] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<GenerationErrorState | null>(null)

  const [progressValue, setProgressValue] = useState(0)
  const [progressDetail, setProgressDetail] = useState('Starting report generation...')
  const progressValueRef = useRef(0)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([])

  const hasConnections = connections.length > 0
  const isGenerating = view === 'generating'

  const animateProgressTo = useCallback((target: number, durationMs: number) => {
    const from = progressValueRef.current
    if (target <= from) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const start = performance.now()

      const tick = (now: number) => {
        const elapsed = now - start
        const ratio = Math.min(1, elapsed / durationMs)
        const next = Math.round(from + (target - from) * ratio)

        progressValueRef.current = next
        setProgressValue(next)

        if (ratio < 1) {
          requestAnimationFrame(tick)
        } else {
          resolve()
        }
      }

      requestAnimationFrame(tick)
    })
  }, [])

  const resetModalForm = useCallback(() => {
    setConnectionId(connections[0]?.id || '')
    setPeriodRange(defaultPeriodRange)
    setCompareRange(defaultCompareRange)
    setIncludeListGrowth(true)
    setAddSummary(false)
    setIncludeActionItems(false)
    setIncludeAccountOverview(false)
    setLanguage('en')
    setFormError(null)
  }, [connections, defaultCompareRange, defaultPeriodRange])

  const openReport = useCallback((reportId: string) => {
    router.push(`/reports/${reportId}`)
  }, [router])

  const handleStartGenerate = useCallback(async () => {
    if (!connectionId) {
      setFormError('Please select a Klaviyo account.')
      return
    }
    if (!periodRange?.from || !periodRange?.to || !compareRange?.from || !compareRange?.to) {
      setFormError('Please select both report and comparison date ranges.')
      return
    }

    const selectedConnection = connections.find((c) => c.id === connectionId)
    if (!selectedConnection) {
      setFormError('Selected account is no longer available.')
      return
    }

    const period = toRangePayload(periodRange)
    const comparison = toRangePayload(compareRange)
    if (!period || !comparison) {
      setFormError('Please choose valid report and comparison date ranges.')
      return
    }

    setFormError(null)
    setModalOpen(false)
    setGenerationError(null)
    setView('generating')
    setProgressValue(0)
    progressValueRef.current = 0
    setActiveStepIndex(0)

    const wantsInsights = addSummary
    const steps = getGenerationSteps({
      includeListGrowth,
      includeAccountOverview,
      includeInsights: wantsInsights,
    })
    setGenerationSteps(steps)

    setProgressDetail('Preparing report request...')
    await animateProgressTo(16, 450)

    let fetchSettled = false
    const fetchPromise = (async (): Promise<{ data: KlaviyoAnalyticsData; fetchedAt: string }> => {
      const params = new URLSearchParams({
        connectionId,
        periodStart: period.start,
        periodEnd: period.end,
        compStart: comparison.start,
        compEnd: comparison.end,
        topN: String(REPORT_TOP_N),
        includeListGrowth: includeListGrowth ? '1' : '0',
        includeAccountOverview: includeAccountOverview ? '1' : '0',
      })

      const res = await fetch(`/api/klaviyo/analytics/dashboard?${params.toString()}`)
      let json: DashboardApiResponse = {}
      try {
        json = (await res.json()) as DashboardApiResponse
      } catch {
        json = {}
      }

      if (json.requiresReconnect) {
        const err = new Error(
          json.error || 'This Klaviyo connection needs to be reconnected to access analytics.'
        ) as Error & { actionUrl?: string; actionLabel?: string }
        err.actionUrl = json.actionUrl || '/connections'
        err.actionLabel = 'Go to connections'
        throw err
      }

      if (!res.ok || json.error) {
        if (res.status === 429 && json.retryAfterSeconds) {
          throw new Error(`Too many requests. Try again in ${json.retryAfterSeconds}s.`)
        }

        const err = new Error(json.error || 'Failed to load live analytics data.') as Error & {
          actionUrl?: string
          actionLabel?: string
        }

        if (json.actionUrl) {
          err.actionUrl = json.actionUrl || '/connections'
          err.actionLabel = 'Go to connections'
        }

        throw err
      }

      if (!json.data) {
        throw new Error('Analytics response was empty.')
      }

      return {
        data: json.data,
        fetchedAt: json.fetchedAt || new Date().toISOString(),
      }
    })().finally(() => {
      fetchSettled = true
    })

    // Calculate step thresholds for the fetch portion (steps between 'prepare' and 'saving')
    const fetchStepIds = steps.map((s) => s.id)
    const savingIndex = fetchStepIds.indexOf('saving')
    const fetchStepCount = savingIndex - 1 // number of data-fetch steps (between prepare and saving)
    const progressPerFetchStep = Math.floor(66 / fetchStepCount) // distribute 16-82 range

    setActiveStepIndex(1) // move past 'prepare' to first fetch step
    setProgressDetail('Fetching live analytics from Klaviyo...')

    while (!fetchSettled) {
      const next = Math.min(82, progressValueRef.current + 1 + Math.floor(Math.random() * 3))
      progressValueRef.current = next
      setProgressValue(next)

      // Advance the active step based on progress thresholds
      const fetchProgress = next - 16 // 0-66 range
      const stepFromProgress = Math.min(
        savingIndex - 1,
        1 + Math.floor(fetchProgress / progressPerFetchStep)
      )
      setActiveStepIndex(stepFromProgress)

      await sleep(260)
    }

    let analyticsResponse: { data: KlaviyoAnalyticsData; fetchedAt: string }
    try {
      analyticsResponse = await fetchPromise
    } catch (error) {
      const message = (error as Error)?.message || 'Failed to generate report.'
      const err = error as Error & { actionUrl?: string; actionLabel?: string }
      setGenerationError({
        message,
        actionUrl: err.actionUrl,
        actionLabel: err.actionLabel,
      })
      setProgressDetail(message)
      return
    }

    const insightsIndex = steps.findIndex((s) => s.id === 'insights')
    const completeIndex = steps.findIndex((s) => s.id === 'complete')
    const savingProgress = wantsInsights ? 85 : 92

    setActiveStepIndex(savingIndex)
    setProgressDetail('Saving report output...')
    await animateProgressTo(savingProgress, 250)

    const connName = selectedConnection.account_name || 'Unnamed account'
    const title = `${connName} - ${formatRangeLabel(period.start, period.end)} Report`

    let savedReport: SavedReportListItem
    try {
      const saveRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          title,
          accountLabel: accountLabel(selectedConnection),
          periodStart: period.start,
          periodEnd: period.end,
          compareStart: comparison.start,
          compareEnd: comparison.end,
          includeListGrowth,
          addSummary,
          includeActionItems,
          includeAccountOverview,
          language,
          fetchedAt: analyticsResponse.fetchedAt,
          analyticsData: analyticsResponse.data,
        }),
      })

      let saveJson: CreateReportApiResponse = {}
      try {
        saveJson = (await saveRes.json()) as CreateReportApiResponse
      } catch {
        saveJson = {}
      }

      if (!saveRes.ok || saveJson.error || !saveJson.report) {
        throw new Error(saveJson.error || 'Failed to save report output.')
      }

      savedReport = saveJson.report
    } catch (error) {
      const message = (error as Error)?.message || 'Failed to save report output.'
      setGenerationError({ message })
      setProgressDetail(message)
      return
    }

    setReports((prev) => [savedReport, ...prev.filter((report) => report.id !== savedReport.id)])

    // Generate insights if the user opted in
    if (wantsInsights && insightsIndex !== -1) {
      setActiveStepIndex(insightsIndex)
      setProgressDetail('Generating insights...')

      let insightsSettled = false
      const insightsPromise = (async () => {
        const res = await fetch(`/api/reports/${savedReport.id}/insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: false }),
        })

        let json: InsightsApiResponse = {}
        try {
          json = (await res.json()) as InsightsApiResponse
        } catch {
          json = {}
        }

        if (!res.ok || json.error) {
          // Insights failure is non-fatal — report is already saved
          console.error('Insights generation failed:', json.error)
        }
      })().finally(() => {
        insightsSettled = true
      })

      const insightsProgressTarget = 96
      while (!insightsSettled) {
        const next = Math.min(
          insightsProgressTarget,
          progressValueRef.current + 1 + Math.floor(Math.random() * 2)
        )
        progressValueRef.current = next
        setProgressValue(next)
        await sleep(300)
      }

      await insightsPromise
      await animateProgressTo(insightsProgressTarget, 150)
    }

    setActiveStepIndex(completeIndex)
    setProgressDetail('Opening your report...')
    await animateProgressTo(100, 240)
    // Navigate first, then reset — stay on the generating screen
    // until Next.js has loaded the report page to avoid a flash
    router.push(`/reports/${savedReport.id}`)
    resetModalForm()
  }, [
    addSummary,
    animateProgressTo,
    compareRange,
    connectionId,
    connections,
    includeAccountOverview,
    includeActionItems,
    includeListGrowth,
    language,
    periodRange,
    resetModalForm,
    router,
  ])

  if (isGenerating) {
    if (generationError) {
      return (
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <Card className="w-full max-w-2xl border-red-200 bg-red-50">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm text-red-700/90">{generationError.message}</p>
              <div className="flex items-center gap-3">
                {generationError.actionUrl && (
                  <Button asChild type="button" variant="outline">
                    <a href={generationError.actionUrl}>
                      {generationError.actionLabel || 'Open settings'}
                    </a>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGenerationError(null)
                    setView('overview')
                  }}
                >
                  Back to report overview
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="w-full max-w-lg border-border/60 shadow-lg">
          <CardContent className="flex flex-col gap-5 pt-8 pb-6">
            {/* Header */}
            <div className="space-y-1 px-1">
              <h2 className="text-lg font-semibold text-foreground">
                Generating your report
              </h2>
              <p className="text-sm text-muted-foreground">
                We&apos;re pulling data from Klaviyo to build your report.
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <Progress
                value={progressValue}
                className="h-2"
                indicatorClassName="bg-orange-500 transition-all duration-300"
              />
              <p className="text-right text-xs text-muted-foreground">
                {progressValue}%
              </p>
            </div>

            {/* Step checklist */}
            <div className="space-y-2">
              {generationSteps.map((step, index) => (
                <GenerationStepRow
                  key={step.id}
                  step={step}
                  status={getStepStatus(index, activeStepIndex)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate client-ready performance reports from live Klaviyo data.
          </p>
        </div>
        <Button
          onClick={() => {
            resetModalForm()
            setModalOpen(true)
          }}
          disabled={!hasConnections}
        >
          <Plus className="h-4 w-4 buttonIcon" />
          Create new report
        </Button>
      </div>

      {!hasConnections && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No Klaviyo connections</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a Klaviyo account before generating reports.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <a href="/connections">Go to Connections</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {reports.length > 0 ? (
        <div className="space-y-2">
          {reports.map((report) => {
            const conn = connections.find(
              (c) => accountLabel(c) === report.accountLabel || c.account_name === report.accountLabel
            )

            return (
              <button
                key={report.id}
                type="button"
                onClick={() => openReport(report.id)}
                className="group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
              >
                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                    <BrandIcon
                      accountName={report.accountLabel}
                      storeUrl={conn?.store_url}
                      className="h-4 w-4 flex-shrink-0 rounded-md"
                    />
                    {report.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 pl-">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatRangeLabel(report.periodStart, report.periodEnd)}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">
                      vs {formatRangeLabel(report.compareStart, report.compareEnd)}
                    </span>
                  </div>
                </div>

                {/* Badges */}
                <div className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
                  {report.addSummary && (
                    <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
                      <Sparkles className="h-2.5 w-2.5" />
                      Insights
                    </Badge>
                  )}
                  {report.includeAccountOverview && (
                    <Badge variant="secondary" className="text-[10px] font-medium">
                      Overview
                    </Badge>
                  )}
                </div>

                {/* Timestamp + chevron */}
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(report.createdAt)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No reports yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first report to get a complete performance breakdown from your Klaviyo data.
            </p>
            <Button
              onClick={() => {
                resetModalForm()
                setModalOpen(true)
              }}
              disabled={!hasConnections}
              className="mt-5"
            >
              <Plus className="h-4 w-4 buttonIcon" />
              Create new report
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Report</DialogTitle>
            <DialogDescription>
              Pick a report date range, comparison date range, and optional sections.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Klaviyo account</Label>
              <ReportAccountSelector
                connections={connections}
                selectedConnectionId={connectionId}
                onSelect={setConnectionId}
                disabled={!hasConnections}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Report date range</Label>
                <DateRangePicker
                  value={periodRange}
                  onChange={setPeriodRange}
                  placeholder="Pick the report range"
                />
              </div>
              <div className="space-y-2">
                <Label>Compare date range</Label>
                <DateRangePicker
                  value={compareRange}
                  onChange={setCompareRange}
                  placeholder="Pick the comparison range"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Report language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-base leading-none">🇺🇸</span>
                      English (US)
                    </span>
                  </SelectItem>
                  <SelectItem value="nl">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-base leading-none">🇳🇱</span>
                      Nederlands
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Report options</p>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="include-list-growth"
                  className="mt-1"
                  checked={includeListGrowth}
                  onCheckedChange={(checked) => setIncludeListGrowth(checked === true)}
                />
                <div>
                <Label htmlFor="include-list-growth" className="font-medium">
                  Include list growth
                </Label>
                 <p className="text-xs text-muted-foreground">
                Mauk.ai automatically finds or creates a Klaviyo segment named &quot;Mauk.ai Reporting Segment&quot; and uses its profile count.
              </p>
              </div>
              </div>
             
              <div className="flex items-start gap-3">
                <Checkbox
                  id="include-insights"
                  className="mt-1"
                  checked={addSummary}
                  onCheckedChange={(checked) => {
                    setAddSummary(checked === true)
                    setIncludeActionItems(checked === true)
                  }}
                />
                <div>
                  <Label htmlFor="include-insights" className="font-medium">
                    Include insights
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Generates a summary with highlights and actionable to-do items for each section of the report.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="include-account-overview"
                  className="mt-1"
                  checked={includeAccountOverview}
                  onCheckedChange={(checked) => setIncludeAccountOverview(checked === true)}
                />
                <div>
                  <Label htmlFor="include-account-overview" className="font-medium">
                    Include account overview
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Shows 12-month revenue, open rate, and click rate trends for campaigns and flows.
                  </p>
                </div>
              </div>
            </div>

            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleStartGenerate()}
              disabled={!hasConnections}
            >
              Generate report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
