import { createClient } from '@/lib/supabase/server'
import { klaviyoFetch } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

type CancelMode = 'edit_details' | 'edit_design' | 'start_over'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const mode: CancelMode = body.mode

    if (!['edit_details', 'edit_design', 'start_over'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch campaign and verify ownership
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'scheduled') {
      return NextResponse.json(
        { error: campaign.status === 'sent' ? 'Campaign has already been sent' : 'Campaign is not scheduled' },
        { status: 400 }
      )
    }

    if (!campaign.klaviyo_campaign_id || !campaign.klaviyo_connection_id) {
      return NextResponse.json({ error: 'Campaign has no Klaviyo data' }, { status: 400 })
    }

    // Check current Klaviyo status before cancelling
    const statusResponse = await klaviyoFetch(
      supabase,
      campaign.klaviyo_connection_id,
      `/api/campaigns/${campaign.klaviyo_campaign_id}`
    )

    if (!statusResponse?.ok) {
      return NextResponse.json({ error: 'Failed to check campaign status in Klaviyo' }, { status: 502 })
    }

    const statusData = await statusResponse.json()
    const klaviyoStatus = statusData.data?.attributes?.status

    if (klaviyoStatus === 'Sent' || klaviyoStatus === 'sent') {
      // Update local status to match
      await supabase
        .from('campaigns')
        .update({
          status: 'sent',
          last_status_synced_at: new Date().toISOString(),
        })
        .eq('id', id)

      return NextResponse.json(
        { error: 'Campaign has already been sent in Klaviyo' },
        { status: 409 }
      )
    }

    // Cancel the send job in Klaviyo
    // Use "revert" for edit modes (sets back to Draft so it can be re-scheduled)
    // Use "cancel" for start_over (permanently cancels before deletion)
    const action = mode === 'start_over' ? 'cancel' : 'revert'
    const cancelResponse = await klaviyoFetch(
      supabase,
      campaign.klaviyo_connection_id,
      `/api/campaign-send-jobs/${campaign.klaviyo_campaign_id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({
          data: {
            type: 'campaign-send-job',
            id: campaign.klaviyo_campaign_id,
            attributes: { action },
          },
        }),
      }
    )

    if (!cancelResponse?.ok) {
      const errorText = await cancelResponse?.text()
      console.error('Failed to cancel Klaviyo send job:', cancelResponse?.status, errorText)
      return NextResponse.json(
        { error: 'Failed to cancel the scheduled send in Klaviyo' },
        { status: 502 }
      )
    }

    // Mode-specific updates
    if (mode === 'start_over') {
      // Delete the Klaviyo campaign
      await klaviyoFetch(
        supabase,
        campaign.klaviyo_connection_id,
        `/api/campaigns/${campaign.klaviyo_campaign_id}`,
        { method: 'DELETE' }
      )

      // Delete local project + frames
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

      // Delete the old campaign
      await supabase
        .from('campaigns')
        .delete()
        .eq('id', id)

      // Create a fresh campaign with the same connection
      const { data: newCampaign, error: createError } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          klaviyo_connection_id: campaign.klaviyo_connection_id,
          klaviyo_account_id: campaign.klaviyo_account_id,
          name: 'Untitled Campaign',
          subject_line: '',
          status: 'in_progress',
          wizard_step: 1,
        })
        .select()
        .single()

      if (createError || !newCampaign) {
        console.error('Failed to create new campaign:', createError)
        return NextResponse.json({ error: 'Failed to create new campaign' }, { status: 500 })
      }

      return NextResponse.json({ success: true, mode, redirectTo: newCampaign.id })
    } else if (mode === 'edit_design') {
      // Keep klaviyo_campaign_id and klaviyo_template_id for update flow
      // Keep step 3 data (subject_line, preview_text, audiences, scheduled_at)
      await supabase
        .from('campaigns')
        .update({
          status: 'in_progress',
          wizard_step: 1,
        })
        .eq('id', id)
    } else {
      // edit_details - just go back to step 3
      await supabase
        .from('campaigns')
        .update({
          status: 'in_progress',
          wizard_step: 3,
        })
        .eq('id', id)
    }

    return NextResponse.json({ success: true, mode })
  } catch (err) {
    console.error('Cancel campaign error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
