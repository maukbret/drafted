'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertCircle, Check, ChevronsUpDown, RefreshCw } from 'lucide-react'
import { startKlaviyoOAuth } from '@/lib/oauth'
import { DateRangeSelector, DateRange, computeDateRange } from '@/components/analytics/date-range-selector'
import { RevenueCards } from '@/components/analytics/revenue-cards'
import { TopCampaigns } from '@/components/analytics/top-campaigns'
import { TopFlows } from '@/components/analytics/top-flows'
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
import { ErrorBoundary } from '@/components/error-boundary'

const REFRESH_COOLDOWN_MS = 8000

interface Connection {
  id: string
  account_name: string | null
  store_url: string | null
  scope: string
  owner_name?: string
}

interface AnalyticsDashboardProps {
  connections: Connection[]
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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

export function AnalyticsDashboard({ connections }: AnalyticsDashboardProps) {
  const searchParams = useSearchParams()
  const queryConnectionId = searchParams.get('connectionId')
  const defaultConnectionId = queryConnectionId && connections.some((c) => c.id === queryConnectionId)
    ? queryConnectionId
    : (connections[0]?.id || '')

  const [connectionId, setConnectionId] = useState(defaultConnectionId)
  const [dateRange, setDateRange] = useState<DateRange>(computeDateRange('last-month'))
  const [data, setData] = useState<KlaviyoAnalyticsData | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [requiresReconnect, setRequiresReconnect] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState<number>(0)

  const fetchAbortRef = useRef<AbortController | null>(null)
  const fetchSeqRef = useRef(0)

  const selectedConnection = connections.find((c) => c.id === connectionId)

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
        topN: '5',
      })
      const res = await fetch(`/api/klaviyo/analytics/dashboard?${params.toString()}`, {
        signal: controller.signal,
      })
      const json = await res.json()

      if (controller.signal.aborted || requestSeq !== fetchSeqRef.current) return

      if (json.requiresReconnect) {
        setRequiresReconnect(true)
        setData(null)
        return
      }

      if (!res.ok || json.error) {
        if (res.status === 429 && json.retryAfterSeconds) {
          setError(`Too many requests. Try again in ${json.retryAfterSeconds}s.`)
        } else {
          setError(json.error || 'Failed to load analytics')
        }
        return
      }

      setData(json.data)
      setFetchedAt(json.fetchedAt || new Date().toISOString())
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError('Failed to load analytics')
    } finally {
      if (requestSeq === fetchSeqRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!connectionId) return
    fetchDashboardData(connectionId, dateRange)
  }, [connectionId, dateRange, fetchDashboardData])

  useEffect(() => {
    if (!queryConnectionId) return
    if (connections.some((c) => c.id === queryConnectionId)) return
    if (connections[0]?.id) setConnectionId(connections[0].id)
  }, [queryConnectionId, connections])

  useEffect(() => {
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort()
    }
  }, [])

  const handleRefresh = () => {
    const now = Date.now()
    if (loading) return
    if (now < refreshCooldownUntil) {
      const secondsLeft = Math.ceil((refreshCooldownUntil - now) / 1000)
      setError(`Please wait ${secondsLeft}s before refreshing again.`)
      return
    }

    setRefreshCooldownUntil(now + REFRESH_COOLDOWN_MS)
    void fetchDashboardData(connectionId, dateRange)
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

  const cooldownSeconds = Math.max(0, Math.ceil((refreshCooldownUntil - Date.now()) / 1000))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">Live performance metrics from Klaviyo</p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <AnalyticsAccountSelector
          connections={connections}
          selectedConnectionId={connectionId}
          onSelect={setConnectionId}
          disabled={loading}
        />

        <DateRangeSelector value={dateRange} onChange={setDateRange} />

        <div className="ml-auto flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {timeAgo(fetchedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading || cooldownSeconds > 0}
          >
            <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
            {cooldownSeconds > 0 ? `Refresh (${cooldownSeconds}s)` : 'Refresh'}
          </Button>
        </div>
      </div>

      {requiresReconnect && selectedConnection && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col items-start gap-3">
            <h3 className="font-semibold">Analytics permissions required</h3>
            <p className="text-sm text-muted-foreground">
              This Klaviyo connection needs to be reconnected to grant analytics access.
            </p>
            <Button
              onClick={() => {
                const err = startKlaviyoOAuth(
                  selectedConnection.account_name || 'Klaviyo account',
                  selectedConnection.store_url || ''
                )
                if (err) console.error(err)
              }}
            >
              Reconnect Klaviyo
            </Button>
          </div>
        </div>
      )}

      {error && !requiresReconnect && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!requiresReconnect && (
        <div className="space-y-4">
          <ErrorBoundary fallbackTitle="Revenue widget failed">
            <RevenueCards
              totalRevenue={data?.totalRevenue ?? 0}
              compTotalRevenue={data?.compTotalRevenue ?? 0}
              attributedRevenue={data?.attributedRevenue ?? 0}
              compAttributedRevenue={data?.compAttributedRevenue ?? 0}
              loading={loading}
            />
          </ErrorBoundary>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ErrorBoundary fallbackTitle="Top campaigns table failed">
              <TopCampaigns
                campaigns={data?.campaigns ?? []}
                compCampaigns={data?.compCampaigns ?? []}
                periodLabel={dateRange.label}
                loading={loading}
              />
            </ErrorBoundary>
            <ErrorBoundary fallbackTitle="Top flows table failed">
              <TopFlows
                flows={data?.flows ?? []}
                compFlows={data?.compFlows ?? []}
                periodLabel={dateRange.label}
                loading={loading}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  )
}
