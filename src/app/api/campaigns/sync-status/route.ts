import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextResponse } from 'next/server'

// Map Klaviyo status to our status
function mapKlaviyoStatus(klaviyoStatus: string): string {
  switch (klaviyoStatus) {
    case 'Sent':
    case 'sent':
      return 'sent'
    case 'Scheduled':
    case 'scheduled':
      return 'scheduled'
    case 'Cancelled':
    case 'cancelled':
      return 'cancelled'
    case 'Draft':
    case 'draft':
      return 'klaviyo_draft'
    default:
      return 'klaviyo_draft'
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's team membership
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single()

    // Get user's own Klaviyo connections
    const { data: ownConnections } = await supabase
      .from('klaviyo_connections')
      .select('id')
      .eq('user_id', user.id)

    const ownConnectionIds = ownConnections?.map(c => c.id) || []

    // Get team admin's connections if user is in a team
    let teamConnectionIds: string[] = []
    if (teamMembership) {
      const { data: adminMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .eq('role', 'admin')

      if (adminMembers && adminMembers.length > 0) {
        const { data: teamConnections } = await supabase
          .from('klaviyo_connections')
          .select('id')
          .in('user_id', adminMembers.map(m => m.user_id))

        teamConnectionIds = teamConnections?.map(c => c.id) || []
      }
    }

    const accessibleConnectionIds = [...new Set([...ownConnectionIds, ...teamConnectionIds])]

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch all campaigns that have been exported to Klaviyo
    const { data: campaigns, error: campaignsError } = accessibleConnectionIds.length > 0
      ? await supabaseAdmin
          .from('campaigns')
          .select('id, klaviyo_campaign_id, klaviyo_connection_id, status')
          .in('klaviyo_connection_id', accessibleConnectionIds)
          .not('klaviyo_campaign_id', 'is', null)
      : { data: [], error: null }

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No campaigns to sync' })
    }

    // Group campaigns by connection to minimize token refreshes
    const campaignsByConnection = campaigns.reduce((acc, campaign) => {
      const connId = campaign.klaviyo_connection_id
      if (!acc[connId]) acc[connId] = []
      acc[connId].push(campaign)
      return acc
    }, {} as Record<string, typeof campaigns>)

    let updatedCount = 0
    const updates: { id: string; oldStatus: string; newStatus: string }[] = []

    // Process each connection's campaigns
    for (const [connectionId, connectionCampaigns] of Object.entries(campaignsByConnection)) {
      // Get valid token for this connection
      const token = await getValidKlaviyoToken(supabaseAdmin, connectionId)

      if (!token) {
        console.log('Skipping connection (no valid token):', connectionId)
        continue
      }

      // Fetch status for each campaign
      for (const campaign of connectionCampaigns) {
        try {
          const response = await fetch(
            `https://a.klaviyo.com/api/campaigns/${campaign.klaviyo_campaign_id}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'revision': '2024-10-15',
              },
            }
          )

          if (!response.ok) {
            console.error('Failed to fetch campaign status:', campaign.klaviyo_campaign_id, response.status)
            continue
          }

          const data = await response.json()
          const klaviyoStatus = data.data?.attributes?.status
          const newStatus = mapKlaviyoStatus(klaviyoStatus)

          // Only update if status has changed
          if (campaign.status !== newStatus) {
            const { error: updateError } = await supabaseAdmin
              .from('campaigns')
              .update({ status: newStatus })
              .eq('id', campaign.id)

            if (!updateError) {
              updatedCount++
              updates.push({
                id: campaign.id,
                oldStatus: campaign.status,
                newStatus,
              })
              console.log(`Updated campaign ${campaign.id}: ${campaign.status} -> ${newStatus}`)
            }
          }
        } catch (err) {
          console.error('Error fetching campaign:', campaign.klaviyo_campaign_id, err)
        }
      }
    }

    return NextResponse.json({
      updated: updatedCount,
      total: campaigns.length,
      updates,
    })
  } catch (err) {
    console.error('Sync status error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
