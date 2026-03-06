'use client'

import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { KlaviyoAnalyticsCampaign } from '@/types/database'

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`
}

function changePct(curr: number, comp: number): number | null {
  if (comp === 0) return null
  return ((curr - comp) / comp) * 100
}

function ChangeBadge({ curr, comp }: { curr: number; comp: number }) {
  if (comp === 0 && curr > 0) {
    return <span className="text-xs font-medium text-green-600">New</span>
  }
  const pct = changePct(curr, comp)
  if (pct === null) return null
  const pos = pct >= 0
  return (
    <span className={`text-xs font-medium ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

const columnHelper = createColumnHelper<KlaviyoAnalyticsCampaign & { rank: number }>()

interface TopCampaignsProps {
  campaigns: KlaviyoAnalyticsCampaign[]
  compCampaigns: KlaviyoAnalyticsCampaign[]
  periodLabel: string
  loading?: boolean
}

export function TopCampaigns({ campaigns, compCampaigns, periodLabel, loading }: TopCampaignsProps) {
  const top5 = useMemo(
    () => campaigns.slice(0, 5).map((c, i) => ({ ...c, rank: i + 1 })),
    [campaigns]
  )

  const aggregateRate = useMemo(
    () => (items: KlaviyoAnalyticsCampaign[], key: 'openRate' | 'clickRate') => {
      const totalDelivered = items.reduce((s, c) => s + c.deliveredCount, 0)
      if (totalDelivered > 0) {
        return items.reduce((s, c) => s + c[key] * c.deliveredCount, 0) / totalDelivered
      }
      if (items.length === 0) return 0
      return items.reduce((s, c) => s + c[key], 0) / items.length
    },
    []
  )

  const aggOpenRate = useMemo(() => aggregateRate(campaigns, 'openRate'), [campaigns, aggregateRate])
  const compAggOpenRate = useMemo(() => aggregateRate(compCampaigns, 'openRate'), [compCampaigns, aggregateRate])
  const aggClickRate = useMemo(() => aggregateRate(campaigns, 'clickRate'), [campaigns, aggregateRate])
  const compAggClickRate = useMemo(() => aggregateRate(compCampaigns, 'clickRate'), [compCampaigns, aggregateRate])

  const columns = useMemo(() => [
    columnHelper.accessor('rank', {
      header: '#',
      cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      size: 40,
    }),
    columnHelper.accessor('name', {
      header: 'Campaign',
      cell: (info) => <span className="font-medium truncate max-w-[200px] block">{info.getValue()}</span>,
    }),
    columnHelper.accessor('revenue', {
      header: 'Revenue',
      cell: (info) => fmtCurrency(info.getValue()),
    }),
    columnHelper.accessor('openRate', {
      header: 'Open rate',
      cell: (info) => fmtPct(info.getValue()),
    }),
    columnHelper.accessor('clickRate', {
      header: 'Click rate',
      cell: (info) => fmtPct(info.getValue()),
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  const table = useReactTable({
    data: top5,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Top campaigns</CardTitle>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No campaign data for this period</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-xs">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-sm py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Aggregate status bar */}
            <div className="mt-3 pt-3 border-t flex gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Avg open rate</span>
                <span className="text-sm font-medium">{fmtPct(aggOpenRate)}</span>
                <ChangeBadge curr={aggOpenRate} comp={compAggOpenRate} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Avg click rate</span>
                <span className="text-sm font-medium">{fmtPct(aggClickRate)}</span>
                <ChangeBadge curr={aggClickRate} comp={compAggClickRate} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
