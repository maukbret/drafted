'use client'

import { Area, AreaChart as RechartsAreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface AreaChartDataset {
  key: string
  label: string
  color: string
}

interface AreaChartProps {
  data: Record<string, string | number>[]
  datasets: AreaChartDataset[]
  xDataKey: string
  yAxisFormatter?: (value: number) => string
  tooltipFormatter?: (value: number) => string
  stacked?: boolean
}

export function AreaChart({ data, datasets, xDataKey, yAxisFormatter, tooltipFormatter, stacked }: AreaChartProps) {
  const config: ChartConfig = {}
  for (const ds of datasets) {
    config[ds.key] = { label: ds.label, color: ds.color }
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full overflow-visible">
      <RechartsAreaChart
        accessibilityLayer
        data={data}
        margin={{ left: 12, right: 12, top: 8 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xDataKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          minTickGap={0}
          tick={{ fontSize: 11 }}
          height={36}
        />
        {yAxisFormatter && (
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => yAxisFormatter(value as number)}
            width={52}
            domain={[0, 'auto']}
          />
        )}
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={tooltipFormatter
                ? (value, name, item, index) => {
                    const key = `${item.dataKey}`
                    const itemConfig = config[key]
                    return (
                      <div className="flex w-full items-center gap-2">
                        <div
                          className="h-2.5 w-1 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: `var(--color-${key})` }}
                        />
                        <span className="text-muted-foreground">{itemConfig?.label || name}</span>
                        <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                          {tooltipFormatter(typeof value === 'number' ? value : 0)}
                        </span>
                      </div>
                    )
                  }
                : undefined}
            />
          }
        />
        {datasets.map((ds) => (
          <Area
            key={ds.key}
            dataKey={ds.key}
            type="monotone"
            fill={`var(--color-${ds.key})`}
            fillOpacity={0.1}
            stroke={`var(--color-${ds.key})`}
            strokeWidth={2}
            stackId={stacked ? 'a' : undefined}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </RechartsAreaChart>
    </ChartContainer>
  )
}
