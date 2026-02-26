'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export type DatePreset = 'last-month' | 'last-30' | 'last-7' | 'custom'

export interface DateRange {
  periodStart: string  // YYYY-MM-DD
  periodEnd: string
  compStart: string
  compEnd: string
  label: string
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getCalendarMonth(monthsAgo: number): { start: Date; end: Date } {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - monthsAgo)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start, end }
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function computeDateRange(preset: DatePreset, customStart?: string, customEnd?: string): DateRange {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (preset === 'last-month') {
    const curr = getCalendarMonth(1)
    const comp = getCalendarMonth(2)
    return {
      periodStart: formatDate(curr.start),
      periodEnd: formatDate(curr.end),
      compStart: formatDate(comp.start),
      compEnd: formatDate(comp.end),
      label: `${monthLabel(curr.start)} vs ${monthLabel(comp.start)}`,
    }
  }

  if (preset === 'last-30') {
    const end = new Date(today)
    end.setDate(end.getDate() - 1)
    const start = new Date(today)
    start.setDate(start.getDate() - 30)
    const compEnd = new Date(start)
    compEnd.setDate(compEnd.getDate() - 1)
    const compStart = new Date(compEnd)
    compStart.setDate(compStart.getDate() - 29)
    return {
      periodStart: formatDate(start),
      periodEnd: formatDate(end),
      compStart: formatDate(compStart),
      compEnd: formatDate(compEnd),
      label: 'Last 30 days vs prior 30 days',
    }
  }

  if (preset === 'last-7') {
    const end = new Date(today)
    end.setDate(end.getDate() - 1)
    const start = new Date(today)
    start.setDate(start.getDate() - 7)
    const compEnd = new Date(start)
    compEnd.setDate(compEnd.getDate() - 1)
    const compStart = new Date(compEnd)
    compStart.setDate(compStart.getDate() - 6)
    return {
      periodStart: formatDate(start),
      periodEnd: formatDate(end),
      compStart: formatDate(compStart),
      compEnd: formatDate(compEnd),
      label: 'Last 7 days vs prior 7 days',
    }
  }

  // Custom
  if (customStart && customEnd) {
    const start = new Date(customStart)
    const end = new Date(customEnd)
    const durationMs = end.getTime() - start.getTime()
    const compEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
    const compStart = new Date(compEnd.getTime() - durationMs)
    return {
      periodStart: customStart,
      periodEnd: customEnd,
      compStart: formatDate(compStart),
      compEnd: formatDate(compEnd),
      label: `${customStart} vs ${formatDate(compStart)}`,
    }
  }

  // Fallback to last month
  return computeDateRange('last-month')
}

interface DateRangeSelectorProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const [preset, setPreset] = useState<DatePreset>('last-month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const handlePresetChange = (newPreset: string) => {
    const p = newPreset as DatePreset
    setPreset(p)
    if (p !== 'custom') {
      onChange(computeDateRange(p))
    }
  }

  const handleCustomChange = (start: string, end: string) => {
    if (start && end && start <= end) {
      onChange(computeDateRange('custom', start, end))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs value={preset} onValueChange={handlePresetChange}>
        <TabsList>
          <TabsTrigger value="last-month">Last month</TabsTrigger>
          <TabsTrigger value="last-30">Last 30 days</TabsTrigger>
          <TabsTrigger value="last-7">Last 7 days</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
      </Tabs>

      {preset === 'custom' && (
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-start" className="text-sm text-muted-foreground whitespace-nowrap">From</Label>
            <Input
              id="custom-start"
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value)
                handleCustomChange(e.target.value, customEnd)
              }}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-end" className="text-sm text-muted-foreground whitespace-nowrap">To</Label>
            <Input
              id="custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value)
                handleCustomChange(customStart, e.target.value)
              }}
              className="w-40"
            />
          </div>
        </div>
      )}

      {value.label && (
        <p className="text-xs text-muted-foreground">{value.label}</p>
      )}
    </div>
  )
}
