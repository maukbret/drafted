import { createClient } from '@/lib/supabase/server'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this connection (own or team admin's)
    let hasAccess = false

    // Check if user owns this connection
    const { data: ownConnection } = await supabase
      .from('klaviyo_connections')
      .select('id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (ownConnection) {
      hasAccess = true
    } else {
      // Check if connection belongs to a team admin
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .single()

      if (teamMembership) {
        const { data: adminMembers } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamMembership.team_id)
          .eq('role', 'admin')

        if (adminMembers && adminMembers.length > 0) {
          const { data: teamConnection } = await supabase
            .from('klaviyo_connections')
            .select('id')
            .eq('id', connectionId)
            .in('user_id', adminMembers.map(m => m.user_id))
            .single()

          if (teamConnection) {
            hasAccess = true
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Get valid token (refreshes automatically if needed)
    const klaviyoToken = await getValidKlaviyoToken(supabase, connectionId)

    if (!klaviyoToken) {
      return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect Klaviyo.' }, { status: 401 })
    }

    const headers = {
      'Authorization': `Bearer ${klaviyoToken}`,
      'Accept': 'application/json',
      'revision': '2024-10-15',
    }

    // Fetch email campaigns, exclude archived
    const filter = encodeURIComponent("and(equals(messages.channel,'email'),equals(archived,false))")
    const response = await fetch(`https://a.klaviyo.com/api/campaigns?filter=${filter}`, { headers })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Klaviyo campaigns API error:', response.status, errorBody)
      return NextResponse.json({ campaigns: [] })
    }

    const data = await response.json()

    const campaigns = (data.data || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.attributes?.name || 'Unnamed Campaign',
      subject: campaign.attributes?.send_options?.subject || null,
      status: campaign.attributes?.status || 'unknown',
      sentAt: campaign.attributes?.send_time || null,
      createdAt: campaign.attributes?.created_at || null,
    }))

    return NextResponse.json({ campaigns })

  } catch (err) {
    console.error('Fetch campaigns error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
