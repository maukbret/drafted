import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function getEditableOwnerIds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const ownerIds = new Set<string>([userId])

  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .single()

  if (membership?.role === 'admin') {
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', membership.team_id)
      .eq('role', 'admin')

    adminMembers?.forEach((member) => ownerIds.add(member.user_id))
  }

  return [...ownerIds]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { action?: string; connectionIds?: string[] } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { action, connectionIds } = body

  if (!action || !connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
    return NextResponse.json({ error: 'action and connectionIds are required' }, { status: 400 })
  }

  if (!['delete', 'share', 'unshare'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  if (action === 'delete') {
    const editableOwnerIds = await getEditableOwnerIds(supabase, user.id)

    const { error } = await supabase
      .from('klaviyo_connections')
      .delete()
      .in('id', connectionIds)
      .in('user_id', editableOwnerIds)

    if (error) {
      console.error('Bulk delete error:', error)
      return NextResponse.json({ error: 'Failed to delete connections' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'share' || action === 'unshare') {
    // Only admins can share/unshare, and only their own connections
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (membership?.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can share connections' }, { status: 403 })
    }

    const { error } = await supabase
      .from('klaviyo_connections')
      .update({ is_shared: action === 'share' })
      .in('id', connectionIds)
      .eq('user_id', user.id)

    if (error) {
      console.error('Bulk share error:', error)
      return NextResponse.json({ error: 'Failed to update sharing' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
