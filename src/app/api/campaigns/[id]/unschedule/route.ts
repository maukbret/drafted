import { createClient } from '@/lib/supabase/server'
import { klaviyoFetch } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
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
        { error: 'Only scheduled campaigns can be unscheduled' },
        { status: 400 }
      )
    }

    if (!campaign.klaviyo_campaign_id || !campaign.klaviyo_connection_id) {
      return NextResponse.json({ error: 'Campaign has no Klaviyo data' }, { status: 400 })
    }

    // Check current Klaviyo status
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
      // Sync local status to match
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

    // Revert the send job in Klaviyo (unschedule → back to Draft)
    const revertResponse = await klaviyoFetch(
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
            attributes: { action: 'revert' },
          },
        }),
      }
    )

    if (!revertResponse?.ok) {
      const errorText = await revertResponse?.text()
      console.error('Failed to unschedule Klaviyo send job:', revertResponse?.status, errorText)
      return NextResponse.json(
        { error: 'Failed to unschedule the campaign in Klaviyo' },
        { status: 502 }
      )
    }

    // Update local status to klaviyo_draft, keep scheduled_at intact
    await supabase
      .from('campaigns')
      .update({
        status: 'klaviyo_draft',
        last_status_synced_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unschedule campaign error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
