export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const ISO_MONTH_RE = /^\d{4}-\d{2}$/

export interface ReportDateRange {
  start: string
  end: string
}

export function isMissingReportRangeColumnsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const maybeError = error as { code?: string | null; message?: string | null }
  if (maybeError.code !== 'PGRST204') return false

  const message = (maybeError.message || '').toLowerCase()
  return (
    message.includes('period_start')
    || message.includes('period_end')
    || message.includes('compare_start')
    || message.includes('compare_end')
  )
}

function toMonthParts(isoMonth: string): { year: number; monthIndex: number } | null {
  if (!ISO_MONTH_RE.test(isoMonth)) return null
  const [yearStr, monthStr] = isoMonth.split('-')
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null
  }

  return { year, monthIndex }
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseIsoDate(isoDate: string): Date | null {
  if (!ISO_DATE_RE.test(isoDate)) return null
  const [yearStr, monthStr, dayStr] = isoDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

export function monthRangeFromIsoMonth(isoMonth: string): ReportDateRange | null {
  const parts = toMonthParts(isoMonth)
  if (!parts) return null

  const startDate = new Date(parts.year, parts.monthIndex, 1)
  const endDate = new Date(parts.year, parts.monthIndex + 1, 0)

  return {
    start: toIsoDate(startDate),
    end: toIsoDate(endDate),
  }
}

export function resolveRangeWithMonthFallback(
  start: string | null | undefined,
  end: string | null | undefined,
  month: string | null | undefined,
): ReportDateRange | null {
  if (start && end && parseIsoDate(start) && parseIsoDate(end) && start <= end) {
    return { start, end }
  }

  if (month) return monthRangeFromIsoMonth(month)
  return null
}

function isFullCalendarMonth(start: Date, end: Date): boolean {
  if (start.getDate() !== 1) return false
  const monthEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0)
  return end.getDate() === monthEnd.getDate()
    && start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
}

export function formatRangeLabel(startIso: string, endIso: string): string {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  if (!start || !end) return `${startIso} - ${endIso}`

  if (isFullCalendarMonth(start, end)) {
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const sameYear = start.getFullYear() === end.getFullYear()
  if (sameYear) {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${startLabel} - ${endLabel}`
  }

  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const endLabel = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startLabel} - ${endLabel}`
}
