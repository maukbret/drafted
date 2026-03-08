import { createClient } from '@/lib/supabase/server'
import { klaviyoFetch } from '@/lib/klaviyo'
import { analyticsPausedResponse, isAnalyticsPaused } from '@/lib/analytics-feature'
import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'

async function verifyAnalyticsAccess(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<boolean> {
  const { data: ownConnection } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .single()

  if (ownConnection) return true

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

export async function GET(request: NextRequest) {
  try {
    if (isAnalyticsPaused()) {
      return NextResponse.json(analyticsPausedResponse(), { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await verifyAnalyticsAccess(supabase, user.id, connectionId)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const response = await klaviyoFetch(supabase, connectionId, '/api/forms/')

    if (!response?.ok) {
      return NextResponse.json({ forms: [] })
    }

    const data = await response.json()
    const forms = (data.data || []).map((form: any) => ({
      id: form.id,
      name: form.attributes?.name || 'Unnamed Form',
    }))

    return NextResponse.json({ forms })
  } catch (err) {
    console.error('Analytics forms error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
