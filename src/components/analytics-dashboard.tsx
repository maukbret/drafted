'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Check, ChevronsUpDown, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { startKlaviyoOAuth } from '@/lib/oauth'
import { DateRangeSelector, DateRange, computeDateRange } from '@/components/analytics/date-range-selector'
import { RevenueCards } from '@/components/analytics/revenue-cards'
import { TopCampaigns } from '@/components/analytics/top-campaigns'
import { TopFlows } from '@/components/analytics/top-flows'
import { ListGrowth } from '@/components/analytics/list-growth'
import { KlaviyoAnalyticsData } from '@/types/database'

interface Connection {
  id: string
  account_name: string
  store_url: string | null
  scope: string
}

interface AnalyticsDashboardProps {
  connections: Connection[]
  userId: string
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

export function AnalyticsDashboard({ connections, userId }: AnalyticsDashboardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const defaultConnectionId = searchParams.get('connectionId') || connections[0]?.id || ''

  const [connectionId, setConnectionId] = useState(defaultConnectionId)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(computeDateRange('last-month'))
  const [data, setData] = useState<KlaviyoAnalyticsData | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [requiresReconnect, setRequiresReconnect] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preferences
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [selectedListName, setSelectedListName] = useState<string | null>(null)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null)

  const selectedConnection = connections.find((c) => c.id === connectionId)

  // Load preferences when connection changes
  useEffect(() => {
    if (!connectionId) return
    fetch(`/api/klaviyo/analytics/preferences?connectionId=${connectionId}`)
      .then((r) => r.json())
      .then((d) => {
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
  }, [connectionId])

  const fetchData = useCallback(async (currentConnectionId: string, range: DateRange) => {
    if (!currentConnectionId) return
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
      const res = await fetch(`/api/klaviyo/analytics/overview?${params}`)
      const json = await res.json()

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
      setFetchedAt(json.fetched_at)
    } catch {
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount and when connection/date changes
  useEffect(() => {
    fetchData(connectionId, dateRange)
  }, [connectionId, dateRange, fetchData])

  // Sync connectionId to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (connectionId) {
      params.set('connectionId', connectionId)
    } else {
      params.delete('connectionId')
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [connectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    if (!connectionId || refreshing || loading) return
    setRefreshing(true)
    setError(null)

    try {
      const res = await fetch('/api/klaviyo/analytics/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          periodStart: dateRange.periodStart,
          periodEnd: dateRange.periodEnd,
          compStart: dateRange.compStart,
          compEnd: dateRange.compEnd,
        }),
      })
      const json = await res.json()

      if (json.requiresReconnect) {
        setRequiresReconnect(true)
        return
      }

      if (!res.ok || json.error) {
        setError(json.error || 'Failed to refresh analytics')
        return
      }

      setData(json.data)
      setFetchedAt(json.fetched_at)
    } catch {
      setError('Failed to refresh analytics')
    } finally {
      setRefreshing(false)
    }
  }

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

    // Save preferences silently — use the Refresh button to fetch updated list metrics
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
        {/* Account switcher */}
        <Popover open={connectionOpen} onOpenChange={setConnectionOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={connectionOpen} className="justify-between min-w-[200px] font-normal">
              {selectedConnection?.account_name || 'Select account'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
            <Command>
              <CommandInput placeholder="Search accounts..." />
              <CommandList>
                <CommandEmpty>No account found.</CommandEmpty>
                <CommandGroup>
                  {connections.map((conn) => (
                    <CommandItem
                      key={conn.id}
                      value={conn.account_name}
                      onSelect={() => {
                        setConnectionId(conn.id)
                        setConnectionOpen(false)
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', connectionId === conn.id ? 'opacity-100' : 'opacity-0')} />
                      {conn.account_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Date range selector */}
        <DateRangeSelector value={dateRange} onChange={setDateRange} />

        {/* Refresh + last updated */}
        <div className="ml-auto flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground">Updated {timeAgo(fetchedAt)}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading || !connectionId}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

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
                selectedConnection.account_name,
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
      {!requiresReconnect && (
        <div className="space-y-4">
          {/* Revenue cards */}
          <RevenueCards
            totalRevenue={data?.totalRevenue ?? 0}
            compTotalRevenue={data?.compTotalRevenue ?? 0}
            attributedRevenue={data?.attributedRevenue ?? 0}
            compAttributedRevenue={data?.compAttributedRevenue ?? 0}
            loading={loading}
          />

          {/* Top campaigns + flows */}
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

          {/* List & form growth */}
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
    </div>
  )
}
