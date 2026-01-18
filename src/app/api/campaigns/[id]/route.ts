import { createClient } from '@/lib/supabase/server'
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

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*, klaviyo_connections(account_name), projects(*, frames(*))')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  return NextResponse.json({ campaign })
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
      'wizard_step',
      'figma_url',
      'project_id',
      'klaviyo_campaign_id',
      'klaviyo_template_id',
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

  // Get campaign to find associated project
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('project_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Delete associated project's frames if there's a project
  if (campaign.project_id) {
    await supabase
      .from('frames')
      .delete()
      .eq('project_id', campaign.project_id)

    await supabase
      .from('projects')
      .delete()
      .eq('id', campaign.project_id)
  }

  // Delete the campaign
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Delete campaign error:', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
