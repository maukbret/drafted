import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*, klaviyo_connections(account_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch campaigns error:', error)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    return NextResponse.json({ campaigns })

  } catch (err) {
    console.error('List campaigns error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { klaviyoConnectionId, name } = await request.json()

    if (!klaviyoConnectionId) {
      return NextResponse.json({ error: 'Klaviyo connection is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the connection belongs to this user or is a team admin's connection
    let connection = null

    // First, check if it's the user's own connection
    const { data: ownConnection } = await supabase
      .from('klaviyo_connections')
      .select('id, klaviyo_account_id')
      .eq('id', klaviyoConnectionId)
      .eq('user_id', user.id)
      .single()

    if (ownConnection) {
      connection = ownConnection
    } else {
      // Check if user is in a team and can use admin's connection
      const { data: membership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .single()

      if (membership) {
        // Get team admins
        const { data: adminMembers } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', membership.team_id)
          .eq('role', 'admin')

        if (adminMembers && adminMembers.length > 0) {
          const adminUserIds = adminMembers.map(m => m.user_id)

          // Check if the connection belongs to a team admin
          const { data: teamConnection } = await supabase
            .from('klaviyo_connections')
            .select('id, klaviyo_account_id')
            .eq('id', klaviyoConnectionId)
            .in('user_id', adminUserIds)
            .single()

          if (teamConnection) {
            connection = teamConnection
          }
        }
      }
    }

    if (!connection) {
      return NextResponse.json({ error: 'Invalid Klaviyo connection' }, { status: 400 })
    }

    // Create the campaign with klaviyo_account_id for persistence
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        klaviyo_connection_id: klaviyoConnectionId,
        klaviyo_account_id: connection.klaviyo_account_id,
        name: name || 'Untitled Campaign',
        subject_line: '',
        status: 'in_progress',
        wizard_step: 1,
      })
      .select()
      .single()

    if (error) {
      console.error('Create campaign error:', error)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    return NextResponse.json({ campaign })

  } catch (err) {
    console.error('Create campaign error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
