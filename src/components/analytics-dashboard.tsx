'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Clock, Loader2, History, Check, ChevronsUpDown } from 'lucide-react'
import { startKlaviyoOAuth } from '@/lib/oauth'
import { DateRangeSelector, DateRange, computeDateRange } from '@/components/analytics/date-range-selector'
import { RevenueCards } from '@/components/analytics/revenue-cards'
import { TopCampaigns } from '@/components/analytics/top-campaigns'
import { TopFlows } from '@/components/analytics/top-flows'
import { ListGrowth } from '@/components/analytics/list-growth'
import { HistoricalDownloadDialog } from '@/components/analytics/historical-download-dialog'
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
import { KlaviyoAnalyticsData } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Connection {
  id: string
  account_name: string | null
  store_url: string | null
  scope: string
  owner_name?: string
  analytics_synced_through?: string | null
}

interface AnalyticsDashboardProps {
  connections: Connection[]
  userId: string
}

const SYNC_STEPS = ['daily-metrics', 'campaigns', 'flows'] as const

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Returns YYYY-MM-01 for N months ago */
function monthsAgo(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function currentMonth(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

interface AnalyticsAccountSelectorProps {
  connections: Connection[]
  selectedConnectionId: string
  onSelect: (connectionId: string) => void
  disabled?: boolean
}

const AnalyticsAccountSelector = memo(function AnalyticsAccountSelector({
  connections,
  selectedConnectionId,
  onSelect,
  disabled,
}: AnalyticsAccountSelectorProps) {
  const [connectionOpen, setConnectionOpen] = useState(false)
  const ownConnections = connections.filter((c) => !c.owner_name)
  const teamConnections = connections.filter((c) => !!c.owner_name)
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId)
  const selectedLabel = selectedConnection
    ? `${selectedConnection.account_name || 'Unnamed account'}${selectedConnection.owner_name ? ` (${selectedConnection.owner_name})` : ''}`
    : 'Select a Klaviyo account'

  return (
    <Popover open={connectionOpen} onOpenChange={setConnectionOpen}>
      <PopoverTrigger asChild>
        <Button
          id="analytics-klaviyo-account"
          variant="outline"
          role="combobox"
          aria-expanded={connectionOpen}
          disabled={disabled}
          className="min-w-[220px] justify-between font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                      setConnectionOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedConnectionId === conn.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
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
                      setConnectionOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedConnectionId === conn.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
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
})

export function AnalyticsDashboard({ connections, userId }: AnalyticsDashboardProps) {
  const searchParams = useSearchParams()

  const queryConnectionId = searchParams.get('connectionId')
  const defaultConnectionId = queryConnectionId && connections.some((c) => c.id === queryConnectionId)
    ? queryConnectionId
    : (connections[0]?.id || '')

  const [connectionId, setConnectionId] = useState(defaultConnectionId)
  const [dateRange, setDateRange] = useState<DateRange>(computeDateRange('last-month'))
  const [data, setData] = useState<KlaviyoAnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [requiresReconnect, setRequiresReconnect] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)

  // Onboarding sync state
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<string | null>(null)
  const [syncedMonths, setSyncedMonths] = useState(0)
  const [totalSyncMonths, setTotalSyncMonths] = useState(0)

  const fetchAbortRef = useRef<AbortController | null>(null)
  const fetchSeqRef = useRef(0)
  const onboardingStartedRef = useRef(false)

  // Preferences
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [selectedListName, setSelectedListName] = useState<string | null>(null)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null)

  const selectedConnection = connections.find((c) => c.id === connectionId)
  const needsOnboarding = selectedConnection && !selectedConnection.analytics_synced_through

  // Load preferences when connection changes
  useEffect(() => {
    if (!connectionId) return
    const controller = new AbortController()
    fetch(`/api/klaviyo/analytics/preferences?connectionId=${connectionId}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (controller.signal.aborted) return
        if (d.preferences) {
          setSelectedListId(d.preferences.selected_list_id)
          setSelectedListName(d.preferences.selected_list_name)
          setSelectedFormId(d.preferences.selected_form_id)
          setSelectedFormName(d.preferences.selected_form_name)
        } else {
          setSelectedListId(null)
          setSelectedListName(null)
          setSelectedFormId(null)
          setSelectedFormName(null)
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [connectionId])

  const fetchDashboardData = useCallback(async (currentConnectionId: string, range: DateRange) => {
    if (!currentConnectionId) return
    const requestSeq = ++fetchSeqRef.current
    if (fetchAbortRef.current) fetchAbortRef.current.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    setLoading(true)
    setError(null)
    setRequiresReconnect(false)

    try {
      const params = new URLSearchParams({
        connectionId: currentConnectionId,
        periodStart: range.periodStart,
        periodEnd: range.periodEnd,
        compStart: range.compStart,
        compEnd: range.compEnd,
      })
      const res = await fetch(`/api/klaviyo/analytics/dashboard?${params}`, { signal: controller.signal })
      const json = await res.json()
      if (controller.signal.aborted || requestSeq !== fetchSeqRef.current) return

      if (json.requiresReconnect) {
        setRequiresReconnect(true)
        setData(null)
        return
      }

      if (!res.ok || json.error) {
        setError(json.error || 'Failed to load analytics')
        return
      }

      setData(json.data)
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return
      setError('Failed to load analytics')
    } finally {
      if (requestSeq === fetchSeqRef.current) setLoading(false)
    }
  }, [])

  // Run onboarding sync when needed
  const runOnboardingSync = useCallback(async (targetConnectionId: string) => {
    setSyncing(true)
    setSyncProgress('Preparing analytics data...')
    setSyncedMonths(0)
    const months = [currentMonth(), monthsAgo(1), monthsAgo(2)]
    setTotalSyncMonths(months.length)

    try {
      // Create all sync jobs first
      await fetch('/api/klaviyo/analytics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: targetConnectionId,
          months,
          triggeredBy: 'onboarding',
        }),
      })

      // Execute each step sequentially with delays to avoid Klaviyo rate limits
      // (campaign-values-reports and flow-values-reports share ~1 req/sec limit)
      for (let mi = 0; mi < months.length; mi++) {
        const month = months[mi]
        const monthLabel = new Date(`${month}T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })

        for (let si = 0; si < SYNC_STEPS.length; si++) {
          const step = SYNC_STEPS[si]
          setSyncProgress(`Syncing ${monthLabel} (${step.replace('-', ' ')})...`)

          // Delay between steps to respect Klaviyo reporting rate limits
          if (mi > 0 || si > 0) {
            await new Promise((r) => setTimeout(r, 2000))
          }

          const res = await fetch('/api/klaviyo/analytics/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connectionId: targetConnectionId,
              month,
              step,
              triggeredBy: 'onboarding',
            }),
          })

          if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            console.error(`[Onboarding] Sync step failed: ${month} ${step}`, json.error)
            // Continue with next step even if one fails
          }
        }

        setSyncedMonths(mi + 1)
      }

      // Update the connection's synced_through in local state
      const conn = connections.find((c) => c.id === targetConnectionId)
      if (conn) {
        conn.analytics_synced_through = months[months.length - 1]
      }

      toast.success('Analytics data synced successfully')
    } catch (err) {
      console.error('[Onboarding] Sync error:', err)
      toast.error('Failed to sync analytics data. Please try again.')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }, [connections])

  // Fetch data on mount and when connection/date changes (if already synced)
  useEffect(() => {
    if (!connectionId) return

    const conn = connections.find((c) => c.id === connectionId)
    if (!conn?.analytics_synced_through) return // Don't fetch if not synced yet

    fetchDashboardData(connectionId, dateRange)
  }, [connectionId, dateRange, fetchDashboardData, connections])

  // Auto-trigger onboarding sync (ref guard prevents StrictMode double-fire)
  useEffect(() => {
    if (!connectionId || syncing || onboardingStartedRef.current) return

    const conn = connections.find((c) => c.id === connectionId)
    if (conn && !conn.analytics_synced_through) {
      onboardingStartedRef.current = true
      runOnboardingSync(connectionId).then(() => {
        onboardingStartedRef.current = false
        fetchDashboardData(connectionId, dateRange)
      }).catch(() => {
        onboardingStartedRef.current = false
      })
    }
  // Only run on connection change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  // If URL has an invalid connectionId, normalize to a valid one
  useEffect(() => {
    if (!queryConnectionId) return
    if (connections.some((c) => c.id === queryConnectionId)) return
    if (connections[0]?.id) setConnectionId(connections[0].id)
  }, [queryConnectionId, connections])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort()
    }
  }, [])

  const handleSelectConnection = useCallback((nextConnectionId: string) => {
    setConnectionId(nextConnectionId)
  }, [])

  const handlePreferencesChange = async (prefs: {
    selectedListId: string | null
    selectedListName: string | null
    selectedFormId: string | null
    selectedFormName: string | null
  }) => {
    setSelectedListId(prefs.selectedListId)
    setSelectedListName(prefs.selectedListName)
    setSelectedFormId(prefs.selectedFormId)
    setSelectedFormName(prefs.selectedFormName)

    await fetch('/api/klaviyo/analytics/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionId,
        selectedListId: prefs.selectedListId,
        selectedListName: prefs.selectedListName,
        selectedFormId: prefs.selectedFormId,
        selectedFormName: prefs.selectedFormName,
      }),
    }).catch(() => {})
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">No Klaviyo connections</h2>
        <p className="text-muted-foreground text-sm">Connect a Klaviyo account to view analytics.</p>
        <Button asChild>
          <a href="/connections">Go to Connections</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">Email performance metrics from Klaviyo</p>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-start gap-4">
        <AnalyticsAccountSelector
          connections={connections}
          selectedConnectionId={connectionId}
          onSelect={handleSelectConnection}
          disabled={loading || syncing}
        />

        <DateRangeSelector value={dateRange} onChange={setDateRange} />

        <div className="ml-auto flex items-center gap-3">
          {selectedConnection?.analytics_synced_through && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Synced through {new Date(`${selectedConnection.analytics_synced_through}T00:00:00Z`).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          )}
          <button
            type="button"
            onClick={() => setHistoryDialogOpen(true)}
            disabled={syncing || !selectedConnection?.analytics_synced_through}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <History className="h-4 w-4" />
            History
          </button>
        </div>
      </div>

      {/* Onboarding sync progress */}
      {syncing && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex flex-col items-center py-10 gap-4">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
            <div className="text-center">
              <h3 className="font-semibold">Preparing your analytics data</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {syncProgress || 'Syncing...'}
              </p>
              {totalSyncMonths > 0 && (
                <div className="mt-3 w-64 mx-auto">
                  <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${(syncedMonths / totalSyncMonths) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {syncedMonths} of {totalSyncMonths} months
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reconnect required state */}
      {requiresReconnect && selectedConnection && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col items-center py-10 gap-4">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <div className="text-center">
              <h3 className="font-semibold">Analytics permissions required</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                This Klaviyo connection needs to be reconnected to grant analytics access. Click below to reconnect — your existing campaigns won&apos;t be affected.
              </p>
            </div>
            <Button onClick={() => {
              const err = startKlaviyoOAuth(
                selectedConnection.account_name || 'Klaviyo account',
                selectedConnection.store_url || ''
              )
              if (err) console.error(err)
            }}>
              Reconnect Klaviyo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !requiresReconnect && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Analytics content */}
      {!requiresReconnect && !syncing && (
        <div className="space-y-4">
          <RevenueCards
            totalRevenue={data?.totalRevenue ?? 0}
            compTotalRevenue={data?.compTotalRevenue ?? 0}
            attributedRevenue={data?.attributedRevenue ?? 0}
            compAttributedRevenue={data?.compAttributedRevenue ?? 0}
            loading={loading}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TopCampaigns
              campaigns={data?.campaigns ?? []}
              compCampaigns={data?.compCampaigns ?? []}
              periodLabel={dateRange.label}
              loading={loading}
            />
            <TopFlows
              flows={data?.flows ?? []}
              compFlows={data?.compFlows ?? []}
              periodLabel={dateRange.label}
              loading={loading}
            />
          </div>

          <ListGrowth
            connectionId={connectionId}
            listNetNew={data?.listNetNew ?? null}
            compListNetNew={data?.compListNetNew ?? null}
            formSubmits={data?.formSubmits ?? null}
            compFormSubmits={data?.compFormSubmits ?? null}
            selectedListId={selectedListId}
            selectedListName={selectedListName}
            selectedFormId={selectedFormId}
            selectedFormName={selectedFormName}
            onPreferencesChange={handlePreferencesChange}
            loading={loading}
          />
        </div>
      )}

      {/* Historical download dialog */}
      {connectionId && (
        <HistoricalDownloadDialog
          connectionId={connectionId}
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
        />
      )}
    </div>
  )
}
