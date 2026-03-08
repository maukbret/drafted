import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { analyticsPausedResponse, isAnalyticsPaused } from '@/lib/analytics-feature'
import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  syncStep,
  createSyncJobs,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  isMonthFullySynced,
  updateSyncedThrough,
  monthStart,
} from '@/lib/analytics-sync'
import type { AnalyticsSyncStep, AnalyticsSyncTrigger } from '@/types/database'

const VALID_STEPS: AnalyticsSyncStep[] = ['daily-metrics', 'campaigns', 'flows']
const VALID_TRIGGERS: AnalyticsSyncTrigger[] = ['cron', 'onboarding', 'manual']

async function verifyConnectionAccess(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<boolean> {
  // Own connection
  const { data: ownConnection } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .single()

  if (ownConnection) return true

  // Team admin access
  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .single()

  if (teamMembership?.role === 'admin') {
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')

    if (adminMembers && adminMembers.length > 0) {
      const { data: teamConnection } = await supabase
        .from('klaviyo_connections')
        .select('id')
        .eq('id', connectionId)
        .in('user_id', adminMembers.map((m) => m.user_id))
        .single()

      if (teamConnection) return true
    }
  }

  return false
}

/**
 * POST /api/klaviyo/analytics/sync
 * Execute one sync step (or create jobs for multiple months)
 *
 * Body: { connectionId, month, step }
 *   - Executes a single sync step
 *
 * Body: { connectionId, months, triggeredBy }
 *   - Creates sync jobs for multiple months (used by onboarding/manual)
 */
export async function POST(request: NextRequest) {
  try {
    if (isAnalyticsPaused()) {
      return NextResponse.json(analyticsPausedResponse(), { status: 503 })
    }

    const body = await request.json()
    const { connectionId } = body

    if (!connectionId) {
      return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
    }

    // Auth: either user session or CRON_SECRET
    const cronSecret = request.headers.get('x-cron-secret')
    const isCron = cronSecret === process.env.CRON_SECRET && !!process.env.CRON_SECRET

    let service: SupabaseClient

    if (isCron) {
      service = createServiceClient()
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const hasAccess = await verifyConnectionAccess(supabase, user.id, connectionId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      }

      service = createServiceClient()
    }

    // Mode 1: Create jobs for multiple months
    if (body.months && Array.isArray(body.months)) {
      const triggeredBy: AnalyticsSyncTrigger = VALID_TRIGGERS.includes(body.triggeredBy)
        ? body.triggeredBy
        : 'manual'
      await createSyncJobs(service, connectionId, body.months, triggeredBy)
      return NextResponse.json({ created: true, months: body.months.length })
    }

    // Mode 2: Execute a single sync step
    const { month, step } = body
    if (!month || !step) {
      return NextResponse.json({ error: 'Missing month or step' }, { status: 400 })
    }
    if (!VALID_STEPS.includes(step)) {
      return NextResponse.json({ error: `Invalid step: ${step}` }, { status: 400 })
    }

    const monthKey = monthStart(month)

    // Find or create the job row
    const { data: existingJob } = await service
      .from('analytics_sync_jobs')
      .select('id, status')
      .eq('connection_id', connectionId)
      .eq('month', monthKey)
      .eq('step', step)
      .single()

    let jobId: string

    if (existingJob) {
      // Reset if it was failed or already completed (re-sync)
      if (existingJob.status === 'running') {
        return NextResponse.json({ error: 'Job already running' }, { status: 409 })
      }
      jobId = existingJob.id
      await service
        .from('analytics_sync_jobs')
        .update({ status: 'pending', error_message: null, started_at: null, completed_at: null })
        .eq('id', jobId)
    } else {
      const { data: newJob, error: insertError } = await service
        .from('analytics_sync_jobs')
        .insert({
          connection_id: connectionId,
          month: monthKey,
          step,
          status: 'pending',
          triggered_by: body.triggeredBy || 'manual',
        })
        .select('id')
        .single()

      if (insertError || !newJob) {
        return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
      }
      jobId = newJob.id
    }

    // Execute
    await markJobRunning(service, jobId)

    const result = await syncStep(service, connectionId, monthKey, step)

    if (result.success) {
      await markJobCompleted(service, jobId)

      // Check if all steps for this month are done
      const fullyDone = await isMonthFullySynced(service, connectionId, monthKey)
      if (fullyDone) {
        await updateSyncedThrough(service, connectionId)
      }

      return NextResponse.json({ success: true, month: monthKey, step })
    } else {
      console.error(`[Analytics Sync] Step failed: ${connectionId} ${monthKey} ${step}:`, result.error)
      await markJobFailed(service, jobId, result.error || 'Unknown error')
      return NextResponse.json(
        { success: false, error: result.error, month: monthKey, step },
        { status: 500 }
      )
    }
  } catch (err) {
    console.error('[Analytics Sync] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/klaviyo/analytics/sync?connectionId=X
 * Returns sync status for all jobs of a connection
 */
export async function GET(request: NextRequest) {
  try {
    if (isAnalyticsPaused()) {
      return NextResponse.json(analyticsPausedResponse(), { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await verifyConnectionAccess(supabase, user.id, connectionId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const service = createServiceClient()

    // History dialog only needs recent months; keep payload bounded.
    const now = new Date()
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    const cutoffMonth = monthStart(cutoff)

    const { data: jobs } = await service
      .from('analytics_sync_jobs')
      .select('month, step, status, error_message')
      .eq('connection_id', connectionId)
      .gte('month', cutoffMonth)
      .order('month', { ascending: true })
      .order('step', { ascending: true })
      .limit(500)

    // Get synced_through from connection
    const { data: connection } = await service
      .from('klaviyo_connections')
      .select('analytics_synced_through')
      .eq('id', connectionId)
      .single()

    return NextResponse.json({
      jobs: jobs || [],
      syncedThrough: connection?.analytics_synced_through || null,
    })
  } catch (err) {
    console.error('[Analytics Sync] GET Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
