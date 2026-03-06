import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { is_hidden } = await request.json()

  if (typeof is_hidden !== 'boolean') {
    return NextResponse.json({ error: 'is_hidden must be a boolean' }, { status: 400 })
  }

  // Fetch the campaign to check ownership / admin access
  const { data: campaign, error: fetchError } = await supabase
    .from('campaigns')
    .select('id, user_id, klaviyo_connection_id')
    .eq('id', id)
    .single()

  if (fetchError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Check if user owns this campaign
  const isOwner = campaign.user_id === user.id

  // Check if user is a team admin with access to this campaign's connection
  let isTeamAdmin = false
  if (!isOwner && campaign.klaviyo_connection_id) {
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (teamMembership) {
      // Verify the campaign's connection belongs to this team
      const { data: connectionOwner } = await supabase
        .from('klaviyo_connections')
        .select('user_id')
        .eq('id', campaign.klaviyo_connection_id)
        .single()

      if (connectionOwner) {
        const { data: ownerInTeam } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamMembership.team_id)
          .eq('user_id', connectionOwner.user_id)
          .single()

        isTeamAdmin = !!ownerInTeam
      }
    }
  }

  if (!isOwner && !isTeamAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ is_hidden })
    .eq('id', id)

  if (updateError) {
    console.error('Failed to update campaign hidden status:', updateError)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ success: true, is_hidden })
}
