'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, FileText, Loader2, Plus } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

type ReportsView = 'overview' | 'generating'

interface GenerationErrorState {
  message: string
  actionUrl?: string
  actionLabel?: string
}

const REPORT_TOP_N = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const [addSummary, setAddSummary] = useState(true)
  const [includeActionItems, setIncludeActionItems] = useState(true)
  const [language, setLanguage] = useState('en')
  const [formError, setFormError] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<GenerationErrorState | null>(null)

  const [progressValue, setProgressValue] = useState(0)
  const [progressDetail, setProgressDetail] = useState('Starting report generation...')
  const progressValueRef = useRef(0)

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
    setAddSummary(true)
    setIncludeActionItems(true)
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

    setProgressDetail('Fetching live analytics from Klaviyo...')
    while (!fetchSettled) {
      const next = Math.min(82, progressValueRef.current + 1 + Math.floor(Math.random() * 3))
      progressValueRef.current = next
      setProgressValue(next)
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

    setProgressDetail('Saving report output...')
    await animateProgressTo(92, 250)

    const title = `${formatRangeLabel(period.start, period.end)} Performance Report`

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
    setProgressDetail('Opening your report...')
    await animateProgressTo(100, 240)
    setView('overview')
    resetModalForm()
    router.push(`/reports/${savedReport.id}`)
  }, [
    addSummary,
    animateProgressTo,
    compareRange,
    connectionId,
    connections,
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
        <div className="flex min-h-[70vh] items-center justify-center">
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
      <div className="flex min-h-[70vh] items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center gap-5 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-foreground" />
            <div className="w-full max-w-xl space-y-3">
              <Progress
                value={progressValue}
                className="h-3"
                indicatorClassName="bg-orange-500"
              />
              <p className="text-center text-sm text-foreground">
                {progressDetail}
              </p>
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

      <div className="rounded-md border p-2">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[42%] bg-muted/35 first:rounded-l-md">Report</TableHead>
              <TableHead className="w-[24%] bg-muted/35">Account</TableHead>
              <TableHead className="w-[12%] bg-muted/35">Period</TableHead>
              <TableHead className="w-[12%] bg-muted/35">Compare</TableHead>
              <TableHead className="w-[10%] bg-muted/35 last:rounded-r-md">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length > 0 ? (
              reports.map((report) => {
                return (
                  <TableRow
                    key={report.id}
                    className="h-[56px] cursor-pointer hover:bg-muted/40"
                    onClick={() => openReport(report.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openReport(report.id)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${report.title}`}
                  >
                    <TableCell className="font-medium">{report.title}</TableCell>
                    <TableCell className="text-muted-foreground">{report.accountLabel}</TableCell>
                    <TableCell className="text-sm">{formatRangeLabel(report.periodStart, report.periodEnd)}</TableCell>
                    <TableCell className="text-sm">{formatRangeLabel(report.compareStart, report.compareEnd)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(report.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-sm text-muted-foreground">
                  No reports generated yet. Click <span className="font-medium text-foreground">Create new report</span> to create your first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
                Drafted automatically finds or creates a Klaviyo segment named &quot;Drafted Reporting Segment&quot; and uses its profile count.
              </p>
              </div>
              </div>
             
              <div className="flex items-center gap-3">
                <Checkbox
                  id="add-summary"
                  checked={addSummary}
                  onCheckedChange={(checked) => setAddSummary(checked === true)}
                />
                <Label htmlFor="add-summary" className="font-medium">
                  Add summary
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="include-action-items"
                  checked={includeActionItems}
                  onCheckedChange={(checked) => setIncludeActionItems(checked === true)}
                />
                <Label htmlFor="include-action-items" className="font-medium">
                  Actionable / to-do
                </Label>
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
