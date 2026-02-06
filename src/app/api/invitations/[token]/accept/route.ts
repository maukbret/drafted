import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// POST - Accept an invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is already in a team
    const { data: existingMembership } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existingMembership) {
      return NextResponse.json({ error: 'You are already a member of a team' }, { status: 400 })
    }

    // Get the invitation
    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from('team_invitations')
      .select('*, teams(id, name)')
      .eq('token', token)
      .eq('status', 'pending')
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 })
    }

    // If invitation is email-specific, enforce that it matches the current user
    if (invitation.email && invitation.email !== user.email) {
      return NextResponse.json({ error: 'This invitation is not for you' }, { status: 403 })
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      // Update status to expired
      await supabaseAdmin
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)

      return NextResponse.json({ error: 'This invitation has expired' }, { status: 400 })
    }

    // Add user as team member
    const { error: memberError } = await supabaseAdmin
      .from('team_members')
      .insert({
        team_id: invitation.team_id,
        user_id: user.id,
        role: 'member'
      })

    if (memberError) {
      console.error('Add team member error:', memberError)
      return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
    }

    // Update invitation status
    const { error: updateError } = await supabaseAdmin
      .from('team_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    if (updateError) {
      console.error('Update invitation error:', updateError)
      // Don't fail the request since the user is already added to the team
    }

    return NextResponse.json({
      success: true,
      team: invitation.teams
    })

  } catch (err) {
    console.error('Accept invitation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
