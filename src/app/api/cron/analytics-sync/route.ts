import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  syncStep,
  createSyncJobs,
  getNextPendingJob,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  isMonthFullySynced,
  updateSyncedThrough,
  monthStart,
} from '@/lib/analytics-sync'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceClient()

    // Find all connections that have analytics scope
    const { data: connections } = await service
      .from('klaviyo_connections')
      .select('id, scope, analytics_synced_through')

    if (!connections || connections.length === 0) {
      return NextResponse.json({ message: 'No connections found', processed: 0 })
    }

    const analyticsConnections = connections.filter((c) =>
      c.scope?.includes('metrics:read')
    )

    if (analyticsConnections.length === 0) {
      return NextResponse.json({ message: 'No connections with analytics scope', processed: 0 })
    }

    // Determine which months need syncing for each connection
    const today = new Date()
    const dayOfMonth = today.getUTCDate()

    for (const conn of analyticsConnections) {
      const months = [monthStart(today)] // Always sync current month

      // If we're in the first 5 days, also sync previous month (attribution window)
      if (dayOfMonth <= 5) {
        const prevMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
        months.push(monthStart(prevMonth))
      }

      await createSyncJobs(service, conn.id, months, 'cron')
    }

    // Process as many pending jobs as we can within ~50s budget
    const startTime = Date.now()
    const TIME_BUDGET_MS = 50_000 // Leave 10s margin
    let processed = 0
    let errors = 0

    while (Date.now() - startTime < TIME_BUDGET_MS) {
      const job = await getNextPendingJob(service)
      if (!job) break // No more pending jobs

      await markJobRunning(service, job.id)

      const result = await syncStep(service, job.connection_id, job.month, job.step)

      if (result.success) {
        await markJobCompleted(service, job.id)

        const fullyDone = await isMonthFullySynced(service, job.connection_id, job.month)
        if (fullyDone) {
          await updateSyncedThrough(service, job.connection_id)
        }
      } else {
        await markJobFailed(service, job.id, result.error || 'Unknown error')
        errors++
      }

      processed++
    }

    return NextResponse.json({
      message: `Processed ${processed} sync jobs`,
      processed,
      errors,
      connections: analyticsConnections.length,
      remainingBudgetMs: Math.max(0, TIME_BUDGET_MS - (Date.now() - startTime)),
    })
  } catch (err) {
    console.error('[Cron] Analytics sync error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
