import { createRouteHandlerClient } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

// GET - Get pending invitations for current user
export async function GET(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createRouteHandlerClient(request)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return applyCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }

    if (!user.email) {
      return applyCookies(NextResponse.json({ invitations: [] }))
    }

    // Get pending invitations for this user's email
    const { data: invitations, error } = await supabase
      .from('team_invitations')
      .select('*, teams(id, name)')
      .eq('email', user.email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch invitations error:', error)
      return applyCookies(NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 }))
    }

    // Get inviter profiles
    const inviterIds = invitations?.map(inv => inv.invited_by).filter(Boolean) || []
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', inviterIds)

    const invitationsWithInviters = invitations?.map(inv => ({
      ...inv,
      inviter_name: profiles?.find(p => p.id === inv.invited_by)?.full_name || null
    })) || []

    return applyCookies(NextResponse.json({ invitations: invitationsWithInviters }))

  } catch (err) {
    console.error('Get invitations error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
