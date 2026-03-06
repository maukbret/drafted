'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export type DatePreset = 'last-month' | 'custom'

export interface DateRange {
  periodStart: string  // YYYY-MM-DD
  periodEnd: string
  compStart: string
  compEnd: string
  label: string
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getCalendarMonth(monthsAgo: number): { start: Date; end: Date } {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - monthsAgo)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start, end }
}

function monthRangeFromIsoMonth(isoMonth: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(isoMonth)) return null
  const [yearStr, monthStr] = isoMonth.split('-')
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return null
  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)
  return { start, end }
}

function previousIsoMonth(isoMonth: string): string {
  const range = monthRangeFromIsoMonth(isoMonth)
  if (!range) return ''
  const d = new Date(range.start)
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function computeDateRange(preset: DatePreset, customMonth?: string, customCompMonth?: string): DateRange {
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

  if (customMonth) {
    const curr = monthRangeFromIsoMonth(customMonth)
    const compMonth = customCompMonth || previousIsoMonth(customMonth)
    const comp = monthRangeFromIsoMonth(compMonth)
    if (curr && comp) {
      return {
        periodStart: formatDate(curr.start),
        periodEnd: formatDate(curr.end),
        compStart: formatDate(comp.start),
        compEnd: formatDate(comp.end),
        label: `${monthLabel(curr.start)} vs ${monthLabel(comp.start)}`,
      }
    }
  }

  return computeDateRange('last-month')
}

interface DateRangeSelectorProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const [preset, setPreset] = useState<DatePreset>('last-month')
  const [customMonth, setCustomMonth] = useState('')
  const [customCompMonth, setCustomCompMonth] = useState('')

  const handlePresetChange = (newPreset: string) => {
    const p = newPreset as DatePreset
    setPreset(p)
    if (p !== 'custom') {
      onChange(computeDateRange('last-month'))
    }
  }

  const updateCustomRange = (month: string, compMonth: string) => {
    if (!month) return
    onChange(computeDateRange('custom', month, compMonth))
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs value={preset} onValueChange={handlePresetChange}>
        <TabsList>
          <TabsTrigger value="last-month">Last month</TabsTrigger>
          <TabsTrigger value="custom">Custom months</TabsTrigger>
        </TabsList>
      </Tabs>

      {preset === 'custom' && (
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-month" className="text-sm text-muted-foreground whitespace-nowrap">Month</Label>
            <Input
              id="custom-month"
              type="month"
              value={customMonth}
              onChange={(e) => {
                const month = e.target.value
                const nextComp = customCompMonth || previousIsoMonth(month)
                setCustomMonth(month)
                if (!customCompMonth && nextComp) setCustomCompMonth(nextComp)
                updateCustomRange(month, nextComp)
              }}
              className="w-44"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-comp-month" className="text-sm text-muted-foreground whitespace-nowrap">Compare</Label>
            <Input
              id="custom-comp-month"
              type="month"
              value={customCompMonth}
              onChange={(e) => {
                const compMonth = e.target.value
                setCustomCompMonth(compMonth)
                updateCustomRange(customMonth, compMonth)
              }}
              className="w-44"
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
