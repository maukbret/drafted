'use client'

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function changePct(curr: number, comp: number): number | null {
  if (comp === 0) return null
  return ((curr - comp) / comp) * 100
}

function ChangeBadge({ curr, comp }: { curr: number; comp: number }) {
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
  const top5 = campaigns.slice(0, 5).map((c, i) => ({ ...c, rank: i + 1 }))

  // Aggregate stats
  const totalDelivered = campaigns.reduce((s, c) => s + c.deliveredCount, 0)
  const compTotalDelivered = compCampaigns.reduce((s, c) => s + c.deliveredCount, 0)

  const aggOpenRate = totalDelivered > 0
    ? campaigns.reduce((s, c) => s + c.openRate * c.deliveredCount, 0) / totalDelivered
    : 0
  const compAggOpenRate = compTotalDelivered > 0
    ? compCampaigns.reduce((s, c) => s + c.openRate * c.deliveredCount, 0) / compTotalDelivered
    : 0

  const aggClickRate = totalDelivered > 0
    ? campaigns.reduce((s, c) => s + c.clickRate * c.deliveredCount, 0) / totalDelivered
    : 0
  const compAggClickRate = compTotalDelivered > 0
    ? compCampaigns.reduce((s, c) => s + c.clickRate * c.deliveredCount, 0) / compTotalDelivered
    : 0

  const columns = [
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
  ]

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
