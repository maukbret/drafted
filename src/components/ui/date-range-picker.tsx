'use client'

import * as React from 'react'
import { format, subDays, startOfWeek, startOfMonth, startOfYear } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface Preset {
  label: string
  range: () => DateRange
}

const PRESETS: Preset[] = [
  {
    label: 'Last 7 days',
    range: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: 'Last 14 days',
    range: () => ({ from: subDays(new Date(), 13), to: new Date() }),
  },
  {
    label: 'Last 30 days',
    range: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: 'Last 90 days',
    range: () => ({ from: subDays(new Date(), 89), to: new Date() }),
  },
  {
    label: 'Week to date',
    range: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: new Date() }),
  },
  {
    label: 'Month to date',
    range: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: 'Year to date',
    range: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
]

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  className,
}: DateRangePickerProps) {
  const [activePreset, setActivePreset] = React.useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = React.useState<Date | undefined>(value?.from)

  function handlePresetSelect(preset: Preset) {
    const range = preset.range()
    setActivePreset(preset.label)
    setCalendarMonth(range.from)
    onChange(range)
  }

  function handleCalendarSelect(range: DateRange | undefined) {
    setActivePreset(null)
    onChange(range)
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, 'LLL dd, y')} -{' '}
                  {format(value.to, 'LLL dd, y')}
                </>
              ) : (
                format(value.from, 'LLL dd, y')
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Preset sidebar */}
            <div className="flex flex-col border-r py-3 w-36 shrink-0">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetSelect(preset)}
                  className={cn(
                    'px-4 py-1.5 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground',
                    activePreset === preset.label
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* Calendar */}
            <Calendar
              mode="range"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              selected={value}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
