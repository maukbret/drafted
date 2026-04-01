import { createClient } from '@/lib/supabase/server'
import { deleteFrameImagesForProject } from '@/lib/frame-images-server'
import { klaviyoFetch } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch campaign without JOINs first
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !campaign) {
    console.error('Failed to fetch campaign:', error)
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Fetch related data separately
  const { data: klaviyoConnection } = await supabase
    .from('klaviyo_connections')
    .select('account_name')
    .eq('id', campaign.klaviyo_connection_id)
    .single()

  const { data: project } = campaign.project_id
    ? await supabase
        .from('projects')
        .select('*, frames(*)')
        .eq('id', campaign.project_id)
        .single()
    : { data: null }

  // Combine the data
  const campaignWithRelations = {
    ...campaign,
    klaviyo_connections: klaviyoConnection,
    projects: project,
  }

  return NextResponse.json({ campaign: campaignWithRelations })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const updates = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only allow updating certain fields
    const allowedFields = [
      'name',
      'subject_line',
      'preview_text',
      'included_audiences',
      'excluded_audiences',
      'status',
      'scheduled_at',
      'send_in_recipient_timezone',
      'wizard_step',
      'figma_url',
      'project_id',
      'klaviyo_connection_id',
      'klaviyo_campaign_id',
      'klaviyo_template_id',
      'slice_mode',
    ]

    const filteredUpdates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (key in updates) {
        filteredUpdates[key] = updates[key]
      }
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(filteredUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Update campaign error:', error)
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    return NextResponse.json({ campaign })

  } catch (err) {
    console.error('Update campaign error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's own connection IDs
  const { data: ownConnections } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('user_id', user.id)

  const ownConnectionIds = ownConnections?.map(c => c.id) || []

  // Parse request body for options
  const body = await request.json().catch(() => ({}))
  const deleteFromKlaviyo = body.deleteFromKlaviyo === true

  // Get campaign - allow if user owns it OR owns the connection it uses
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('project_id, user_id, klaviyo_connection_id, klaviyo_campaign_id, klaviyo_template_id')
    .eq('id', id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Check if user can delete: owns the campaign OR owns the connection
  let canDelete = campaign.user_id === user.id || ownConnectionIds.includes(campaign.klaviyo_connection_id)

  // Also allow team admins to delete campaigns from their team members
  if (!canDelete) {
    const { data: adminMembership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (adminMembership) {
      const { data: creatorMembership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', campaign.user_id)
        .eq('team_id', adminMembership.team_id)
        .single()

      if (creatorMembership) {
        canDelete = true
      }
    }
  }

  if (!canDelete) {
    return NextResponse.json({ error: 'Not authorized to delete this campaign' }, { status: 403 })
  }

  // Delete from Klaviyo if requested and IDs exist
  const klaviyoAlreadyDeleted: string[] = []
  if (deleteFromKlaviyo && campaign.klaviyo_connection_id) {
    // Delete campaign first (it references the template)
    if (campaign.klaviyo_campaign_id) {
      try {
        const res = await klaviyoFetch(
          supabase,
          campaign.klaviyo_connection_id,
          `/api/campaigns/${campaign.klaviyo_campaign_id}`,
          { method: 'DELETE' }
        )
        if (res?.status === 404) klaviyoAlreadyDeleted.push('campaign')
      } catch { /* ignore */ }
    }

    // Then delete the template
    if (campaign.klaviyo_template_id) {
      try {
        const res = await klaviyoFetch(
          supabase,
          campaign.klaviyo_connection_id,
          `/api/templates/${campaign.klaviyo_template_id}`,
          { method: 'DELETE' }
        )
        if (res?.status === 404) klaviyoAlreadyDeleted.push('template')
      } catch { /* ignore */ }
    }
  }

  // Delete associated project's frames if there's a project
  if (campaign.project_id) {
    await deleteFrameImagesForProject(campaign.user_id, campaign.project_id)

    await supabase
      .from('frames')
      .delete()
      .eq('project_id', campaign.project_id)

    await supabase
      .from('projects')
      .delete()
      .eq('id', campaign.project_id)
  }

  // Delete the campaign (RLS will also verify access)
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Delete campaign error:', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }

  return NextResponse.json({ success: true, klaviyoAlreadyDeleted })
}
