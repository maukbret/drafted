'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart } from '@/components/analytics/area-chart'
import { KlaviyoAnalyticsData } from '@/types/database'

interface AccountOverviewChartsProps {
  data: NonNullable<KlaviyoAnalyticsData['accountOverview']>
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 7)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function formatCurrencyAxis(value: number): string {
  if (value >= 1000) return `€${(value / 1000).toFixed(1)}k`
  return `€${value.toFixed(0)}`
}

function formatCurrencyTooltip(value: number): string {
  return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercentAxis(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}

function formatPercentTooltip(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function hasNonZeroValues(arr: number[]): boolean {
  return arr.some((v) => v > 0)
}

const FLOW_COLOR = '#FF4702'
const CAMPAIGN_COLOR = 'hsl(221 83% 53%)'

export function AccountOverviewCharts({ data }: AccountOverviewChartsProps) {
  const hasCampaignRevenue = hasNonZeroValues(data.campaignRevenue)
  const hasCampaignOpenRate = hasNonZeroValues(data.campaignOpenRate)
  const hasCampaignClickRate = hasNonZeroValues(data.campaignClickRate)

  const chartData = data.months.map((m, i) => ({
    month: formatMonth(m),
    ...(hasCampaignRevenue ? { campaigns: Math.max(0, data.campaignRevenue[i]) } : {}),
    flows: Math.max(0, data.flowRevenue[i]),
  }))

  const openRateData = data.months.map((m, i) => ({
    month: formatMonth(m),
    ...(hasCampaignOpenRate ? { campaigns: data.campaignOpenRate[i] } : {}),
    flows: data.flowOpenRate[i],
  }))

  const clickRateData = data.months.map((m, i) => ({
    month: formatMonth(m),
    ...(hasCampaignClickRate ? { campaigns: data.campaignClickRate[i] } : {}),
    flows: data.flowClickRate[i],
  }))

  const revenueDatasets = [
    ...(hasCampaignRevenue
      ? [{ key: 'campaigns', label: 'Campaigns', color: CAMPAIGN_COLOR }]
      : []),
    { key: 'flows', label: 'Flows', color: FLOW_COLOR },
  ]

  const openRateDatasets = [
    ...(hasCampaignOpenRate
      ? [{ key: 'campaigns', label: 'Campaigns', color: CAMPAIGN_COLOR }]
      : []),
    { key: 'flows', label: 'Flows', color: FLOW_COLOR },
  ]

  const clickRateDatasets = [
    ...(hasCampaignClickRate
      ? [{ key: 'campaigns', label: 'Campaigns', color: CAMPAIGN_COLOR }]
      : []),
    { key: 'flows', label: 'Flows', color: FLOW_COLOR },
  ]

  const first = formatMonth(data.months[0])
  const last = formatMonth(data.months[data.months.length - 1])
  const rangeLabel = `${first} – ${last}`

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Account Overview</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Revenue</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaChart
            data={chartData}
            datasets={revenueDatasets}
            xDataKey="month"
            yAxisFormatter={formatCurrencyAxis}
            tooltipFormatter={formatCurrencyTooltip}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Open Rate</CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={openRateData}
              datasets={openRateDatasets}
              xDataKey="month"
              yAxisFormatter={formatPercentAxis}
              tooltipFormatter={formatPercentTooltip}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Click Rate</CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={clickRateData}
              datasets={clickRateDatasets}
              xDataKey="month"
              yAxisFormatter={formatPercentAxis}
              tooltipFormatter={formatPercentTooltip}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
