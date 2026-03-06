'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, Download, AlertCircle, RefreshCw, X } from 'lucide-react'

const SYNC_STEPS = ['daily-metrics', 'campaigns', 'flows'] as const

interface SyncJob {
  month: string
  step: string
  status: string
  error_message: string | null
}

interface MonthStatus {
  month: string
  label: string
  status: 'available' | 'not-downloaded' | 'syncing' | 'failed' | 'partial'
  completedSteps: number
}

interface HistoricalDownloadDialogProps {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const actionButtonClass =
  'inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'

const statusBadgeClass =
  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium'

function renderStatusBadge(status: MonthStatus['status']) {
  if (status === 'available') {
    return (
      <span className={`${statusBadgeClass} border-green-200 bg-green-50 text-green-700`}>
        <Check className="h-3 w-3" />
        Available
      </span>
    )
  }

  if (status === 'not-downloaded') {
    return (
      <span className={`${statusBadgeClass} border-gray-200 bg-gray-50 text-gray-700`}>
        Not downloaded
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className={`${statusBadgeClass} border-red-200 bg-red-50 text-red-700`}>
        <AlertCircle className="h-3 w-3" />
        Failed
      </span>
    )
  }

  if (status === 'partial') {
    return (
      <span className={`${statusBadgeClass} border-amber-200 bg-amber-50 text-amber-700`}>
        Partial
      </span>
    )
  }

  return (
    <span className={`${statusBadgeClass} border-blue-200 bg-blue-50 text-blue-700`}>
      <Loader2 className="h-3 w-3 animate-spin" />
      Syncing...
    </span>
  )
}

function getMonthStatuses(jobs: SyncJob[], months: string[]): MonthStatus[] {
  return months.map((month) => {
    const monthJobs = jobs.filter((j) => j.month === month)
    const label = new Date(`${month}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })

    if (monthJobs.length === 0) {
      return { month, label, status: 'not-downloaded' as const, completedSteps: 0 }
    }

    const completed = monthJobs.filter((j) => j.status === 'completed')
    const running = monthJobs.filter((j) => j.status === 'running')
    const failed = monthJobs.filter((j) => j.status === 'failed')

    if (completed.length >= 3) {
      return { month, label, status: 'available' as const, completedSteps: 3 }
    }
    if (running.length > 0) {
      return { month, label, status: 'syncing' as const, completedSteps: completed.length }
    }
    if (failed.length > 0 && completed.length === 0) {
      return { month, label, status: 'failed' as const, completedSteps: 0 }
    }
    return { month, label, status: 'partial' as const, completedSteps: completed.length }
  })
}

function getLast12Months(): string[] {
  const months: string[] = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}-01`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

export function HistoricalDownloadDialog({
  connectionId,
  open,
  onOpenChange,
}: HistoricalDownloadDialogProps) {
  const [jobs, setJobs] = useState<SyncJob[]>([])
  const [syncingMonth, setSyncingMonth] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const months = getLast12Months()

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    setStatusError(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(`/api/klaviyo/analytics/sync?connectionId=${connectionId}`, {
        signal: controller.signal,
      })
      if (!res.ok) {
        setStatusError('Could not load history. Please try again.')
        return
      }
      const data = await res.json()
      // Defensive cap in case server returns unexpected payload size.
      setJobs((data.jobs || []).slice(0, 500))
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setStatusError('History request timed out. Please try again.')
      } else {
        setStatusError('Could not load history. Please try again.')
      }
    } finally {
      clearTimeout(timeout)
      setLoadingStatus(false)
    }
  }, [connectionId])

  useEffect(() => {
    if (open) fetchStatus()
  }, [open, fetchStatus])

  const handleSyncMonth = async (month: string) => {
    setSyncingMonth(month)

    try {
      // Ensure month exists in the queue and can be refreshed manually.
      await fetch('/api/klaviyo/analytics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          months: [month],
          triggeredBy: 'manual',
        }),
      })

      // Execute each step sequentially with delays for Klaviyo rate limits
      for (let i = 0; i < SYNC_STEPS.length; i++) {
        const step = SYNC_STEPS[i]

        // Keep calls serialized and spaced out for Klaviyo reporting rate limits.
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 2000))
        }

        const res = await fetch('/api/klaviyo/analytics/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId, month, step, triggeredBy: 'manual' }),
        })

        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          console.error(`[Historical] Sync step failed: ${month} ${step}`, json.error)
        }
      }

      // Refresh status
      await fetchStatus()
    } catch (err) {
      console.error('[Historical] Sync error:', err)
    } finally {
      setSyncingMonth(null)
    }
  }

  const monthStatuses = getMonthStatuses(jobs, months)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Historical Analytics</h2>
            <p className="text-sm text-gray-600">Download historical months to view in the dashboard</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {statusError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {statusError}
            </div>
          )}
          {loadingStatus ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
          ) : (
            monthStatuses.map(({ month, label, status }) => (
              <div
                key={month}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
              >
                <span className="text-sm font-medium">{label}</span>

                <div className="flex items-center gap-2">
                  {syncingMonth === month
                    ? (
                      <span className={`${statusBadgeClass} border-blue-200 bg-blue-50 text-blue-700`}>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Syncing...
                      </span>
                    )
                    : renderStatusBadge(status)}

                  {syncingMonth !== month && (
                    <button
                      type="button"
                      className={actionButtonClass}
                      onClick={() => handleSyncMonth(month)}
                      disabled={syncingMonth !== null || status === 'syncing'}
                    >
                      {status === 'not-downloaded' ? (
                        <>
                          <Download className="h-3 w-3" />
                          Download
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" />
                          Refresh
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
