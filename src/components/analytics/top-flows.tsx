'use client'

import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KlaviyoAnalyticsFlow } from '@/types/database'

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

const columnHelper = createColumnHelper<KlaviyoAnalyticsFlow & { rank: number }>()

interface TopFlowsProps {
  flows: KlaviyoAnalyticsFlow[]
  compFlows: KlaviyoAnalyticsFlow[]
  periodLabel: string
  loading?: boolean
}

export function TopFlows({ flows, compFlows, periodLabel, loading }: TopFlowsProps) {
  const top5 = useMemo(
    () => flows.slice(0, 5).map((f, i) => ({ ...f, rank: i + 1 })),
    [flows]
  )

  const aggregateRate = useMemo(
    () => (items: KlaviyoAnalyticsFlow[], key: 'openRate' | 'clickRate') => {
      const totalDelivered = items.reduce((s, f) => s + f.deliveredCount, 0)
      if (totalDelivered > 0) {
        return items.reduce((s, f) => s + f[key] * f.deliveredCount, 0) / totalDelivered
      }
      if (items.length === 0) return 0
      return items.reduce((s, f) => s + f[key], 0) / items.length
    },
    []
  )

  const aggOpenRate = useMemo(() => aggregateRate(flows, 'openRate'), [flows, aggregateRate])
  const compAggOpenRate = useMemo(() => aggregateRate(compFlows, 'openRate'), [compFlows, aggregateRate])
  const aggClickRate = useMemo(() => aggregateRate(flows, 'clickRate'), [flows, aggregateRate])
  const compAggClickRate = useMemo(() => aggregateRate(compFlows, 'clickRate'), [compFlows, aggregateRate])

  const columns = useMemo(() => [
    columnHelper.accessor('rank', {
      header: '#',
      cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      size: 40,
    }),
    columnHelper.accessor('name', {
      header: 'Flow',
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
          <Skeleton className="h-5 w-32" />
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
          <CardTitle className="text-base">Top flows</CardTitle>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>
      </CardHeader>
      <CardContent>
        {flows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No flow data for this period</p>
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
