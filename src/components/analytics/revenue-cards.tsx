'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function GrowthBadge({ current, comparison }: { current: number; comparison: number }) {
  if (comparison === 0) {
    return current > 0 ? <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">New</Badge> : null
  }
  const pct = ((current - comparison) / comparison) * 100
  const isPositive = pct >= 0
  return (
    <Badge
      variant="outline"
      className={isPositive
        ? 'text-green-600 border-green-200 bg-green-50'
        : 'text-red-600 border-red-200 bg-red-50'
      }
    >
      {isPositive
        ? <TrendingUp className="h-3 w-3 mr-1" />
        : <TrendingDown className="h-3 w-3 mr-1" />
      }
      {isPositive ? '+' : ''}{pct.toFixed(1)}%
    </Badge>
  )
}

interface RevenueCardsProps {
  totalRevenue: number
  compTotalRevenue: number
  attributedRevenue: number
  compAttributedRevenue: number
  loading?: boolean
}

export function RevenueCards({
  totalRevenue,
  compTotalRevenue,
  attributedRevenue,
  compAttributedRevenue,
  loading,
}: RevenueCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-5 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
          <div className="flex items-center gap-2 mt-1">
            <GrowthBadge current={totalRevenue} comparison={compTotalRevenue} />
            <span className="text-xs text-muted-foreground">vs {formatCurrency(compTotalRevenue)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Klaviyo attributed revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(attributedRevenue)}</div>
          <div className="flex items-center gap-2 mt-1">
            <GrowthBadge current={attributedRevenue} comparison={compAttributedRevenue} />
            <span className="text-xs text-muted-foreground">vs {formatCurrency(compAttributedRevenue)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
