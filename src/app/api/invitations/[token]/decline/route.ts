import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST - Decline an invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the invitation
    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('id, email, status')
      .eq('token', token)
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 })
    }

    // Verify this invitation is for the current user
    if (invitation.email && invitation.email !== user.email) {
      return NextResponse.json({ error: 'This invitation is not for you' }, { status: 403 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'This invitation has already been processed' }, { status: 400 })
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('team_invitations')
      .update({ status: 'declined' })
      .eq('id', invitation.id)

    if (updateError) {
      console.error('Update invitation error:', updateError)
      return NextResponse.json({ error: 'Failed to decline invitation' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Decline invitation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
