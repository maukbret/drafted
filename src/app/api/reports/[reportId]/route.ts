import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessReports } from '@/lib/feature-access'

interface UpdateReportPayload {
  title?: string
}

interface RouteProps {
  params: Promise<{ reportId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  try {
    const { reportId } = await params

    let body: UpdateReportPayload = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const title = body.title?.trim() || ''
    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }
    if (title.length > 120) {
      return NextResponse.json({ error: 'Title is too long (max 120 characters).' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canAccessReports(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error } = await supabase
      .from('analytics_reports')
      .update({ title })
      .eq('id', reportId)
      .eq('user_id', user.id)
      .select('id, title')
      .single()

    if (error || !updated) {
      const status = error?.code === 'PGRST116' ? 404 : 500
      return NextResponse.json({ error: status === 404 ? 'Report not found.' : 'Failed to update report title.' }, { status })
    }

    return NextResponse.json({ id: updated.id, title: updated.title })
  } catch (err) {
    console.error('Update analytics report error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
