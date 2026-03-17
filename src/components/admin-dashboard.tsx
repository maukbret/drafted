'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { toast } from '@/hooks/use-toast'

interface TopUser {
  id: string
  email: string
  full_name: string | null
  campaigns: number
  reports: number
  plan: string | null
  last_active: string | null
  rank: number
}

interface RecentSignup {
  id: string
  email: string
  full_name: string | null
  created_at: string
  plan: string | null
  plan_since: string | null
}

interface StatsData {
  totalUsers: number
  activeUsersInRange: number
  campaignsInRange: number
  reportsInRange: number
  klaviyoConnections: number
  klaviyoFooters: number
  defaultAudiences: number
  topUsers: TopUser[]
  recentSignups: RecentSignup[]
}

interface SearchResult {
  id: string
  email: string
  full_name: string | null
  created_at: string
  campaigns: number
  reports: number
  plan: string | null
  subscription_status: string | null
  last_sign_in: string | null
}

const PLAN_LABELS: Record<string, string> = {
  pro: 'Pro',
  advanced: 'Advanced',
  starter: 'Starter',
}

function PlanBadge({ plan }: { plan: string | null }) {
  if (!plan) return <Badge variant="outline">Free</Badge>
  const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
    pro: 'default',
    advanced: 'secondary',
    starter: 'outline',
  }
  return <Badge variant={variants[plan] ?? 'outline'}>{PLAN_LABELS[plan] ?? plan}</Badge>
}

function KpiCard({ title, value, loading }: { title: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-bold">{value.toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function AdminDashboard() {
  const today = new Date()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: today,
    to: today,
  })
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const [upgradeEmail, setUpgradeEmail] = useState('')
  const [upgradeTier, setUpgradeTier] = useState<string>('')
  const [upgrading, setUpgrading] = useState(false)

  const fetchStats = useCallback(async (range: DateRange | undefined) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (range?.from) params.set('start', format(range.from, 'yyyy-MM-dd'))
      if (range?.to) params.set('end', format(range.to, 'yyyy-MM-dd'))
      else if (range?.from) params.set('end', format(range.from, 'yyyy-MM-dd'))

      const res = await fetch(`/api/admin/stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)
    } catch {
      toast({ title: 'Failed to load stats', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats(dateRange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDateChange(range: DateRange | undefined) {
    setDateRange(range)
    if (range?.from) {
      fetchStats(range)
    }
  }

  async function handleSearch() {
    if (!searchEmail.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
    try {
      const res = await fetch(`/api/admin/search?email=${encodeURIComponent(searchEmail.trim())}`)
      const data = await res.json()
      if (!res.ok) {
        setSearchError(data.error ?? 'User not found')
      } else {
        setSearchResult(data)
        setUpgradeEmail(data.email)
      }
    } catch {
      setSearchError('Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleUpgrade() {
    if (!upgradeEmail.trim() || !upgradeTier) return
    setUpgrading(true)
    try {
      const res = await fetch('/api/admin/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: upgradeEmail.trim(), tier: upgradeTier }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: data.error ?? 'Upgrade failed', variant: 'destructive' })
      } else {
        toast({ title: `Upgraded ${upgradeEmail} to ${upgradeTier}` })
        // Refresh search result if same email
        if (searchResult?.email.toLowerCase() === upgradeEmail.toLowerCase()) {
          setSearchResult((prev) => prev ? { ...prev, plan: upgradeTier } : prev)
        }
      }
    } catch {
      toast({ title: 'Upgrade failed', variant: 'destructive' })
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm">Platform usage overview</p>
        </div>
        <div className="w-72">
          <DateRangePicker value={dateRange} onChange={handleDateChange} placeholder="Select period" />
        </div>
      </div>

      {/* Section 1: KPI Cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Overview</h2>
        <div className="grid grid-cols-4 gap-4">
          <KpiCard title="Total Users" value={stats?.totalUsers ?? 0} loading={loading} />
          <KpiCard title="Active Users" value={stats?.activeUsersInRange ?? 0} loading={loading} />
          <KpiCard title="Campaigns Created" value={stats?.campaignsInRange ?? 0} loading={loading} />
          <KpiCard title="Reports Created" value={stats?.reportsInRange ?? 0} loading={loading} />
        </div>
      </section>

      {/* Section 2: Feature Adoption */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Feature Adoption</h2>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard title="Klaviyo Connections" value={stats?.klaviyoConnections ?? 0} loading={loading} />
          <KpiCard title="Footers Set Up" value={stats?.klaviyoFooters ?? 0} loading={loading} />
          <KpiCard title="Default Audiences" value={stats?.defaultAudiences ?? 0} loading={loading} />
        </div>
      </section>

      {/* Section 3: Top 10 Users */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Users by Campaigns</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Campaigns</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead>Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : stats?.topUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data</TableCell>
                  </TableRow>
                ) : (
                  stats?.topUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-muted-foreground">{u.rank}</TableCell>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">{u.full_name ?? '—'}</TableCell>
                      <TableCell>{u.campaigns}</TableCell>
                      <TableCell>{u.reports}</TableCell>
                      <TableCell><PlanBadge plan={u.plan} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Section 4: Recent Signups */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Signups</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Signed Up</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Plan Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : stats?.recentSignups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No data</TableCell>
                  </TableRow>
                ) : (
                  stats?.recentSignups.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">{u.full_name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(u.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell><PlanBadge plan={u.plan} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.plan_since ? format(new Date(u.plan_since), 'MMM d, yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Section 5: User Search */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">User Search</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Search by email..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-sm"
          />
          <Button onClick={handleSearch} disabled={searching || !searchEmail.trim()}>
            {searching ? 'Searching...' : 'Search'}
          </Button>
        </div>
        {searchError && (
          <p className="text-sm text-destructive">{searchError}</p>
        )}
        {searchResult && (
          <div className="border rounded-md p-4 space-y-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span>{' '}
                <span className="font-medium">{searchResult.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Name:</span>{' '}
                <span>{searchResult.full_name ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Campaigns:</span>{' '}
                <span>{searchResult.campaigns}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Reports:</span>{' '}
                <span>{searchResult.reports}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Plan:</span>{' '}
                <PlanBadge plan={searchResult.plan} />
              </div>
              <div>
                <span className="text-muted-foreground">Last sign in:</span>{' '}
                <span>
                  {searchResult.last_sign_in
                    ? format(new Date(searchResult.last_sign_in), 'MMM d, yyyy HH:mm')
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Signed up:</span>{' '}
                <span>{format(new Date(searchResult.created_at), 'MMM d, yyyy')}</span>
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Select value={upgradeTier} onValueChange={setUpgradeTier}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleUpgrade} disabled={upgrading || !upgradeTier} size="sm">
                {upgrading ? 'Upgrading...' : 'Set Plan'}
              </Button>
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
