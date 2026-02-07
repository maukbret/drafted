import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's own Klaviyo connections
    const { data: ownConnections } = await supabase
      .from('klaviyo_connections')
      .select('id, account_name, klaviyo_account_id')
      .eq('user_id', user.id)

    // Get user's team membership
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single()

    // Get team admin connections (if user is in a team)
    let teamAdminConnections: typeof ownConnections = []
    if (teamMembership) {
      const { data: adminMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .eq('role', 'admin')

      if (adminMembers && adminMembers.length > 0) {
        const adminUserIds = adminMembers.map(m => m.user_id).filter(id => id !== user.id)
        if (adminUserIds.length > 0) {
          const { data: adminConns } = await supabase
            .from('klaviyo_connections')
            .select('id, account_name, klaviyo_account_id')
            .in('user_id', adminUserIds)

          teamAdminConnections = adminConns || []
        }
      }
    }

    // Get all footers for this user
    const { data: footers } = await supabase
      .from('klaviyo_footers')
      .select('klaviyo_account_id')
      .eq('user_id', user.id)

    // Also get team admin footers
    let teamFooters: typeof footers = []
    if (teamMembership) {
      const { data: adminMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .eq('role', 'admin')

      if (adminMembers && adminMembers.length > 0) {
        const { data: adminFooters } = await supabase
          .from('klaviyo_footers')
          .select('klaviyo_account_id')
          .in('user_id', adminMembers.map(m => m.user_id))

        teamFooters = adminFooters || []
      }
    }

    const accountsWithFooters = new Set([
      ...(footers?.map(f => f.klaviyo_account_id) || []),
      ...(teamFooters?.map(f => f.klaviyo_account_id) || []),
    ])

    // Find connections without footers
    const connectionsWithoutFooter: {
      id: string
      account_name: string | null
      klaviyo_account_id: string | null
      isOwn: boolean
    }[] = []

    for (const conn of ownConnections || []) {
      if (!conn.klaviyo_account_id || !accountsWithFooters.has(conn.klaviyo_account_id)) {
        connectionsWithoutFooter.push({ ...conn, isOwn: true })
      }
    }

    const isTeamAdmin = teamMembership?.role === 'admin'
    for (const conn of teamAdminConnections || []) {
      if (!conn.klaviyo_account_id || !accountsWithFooters.has(conn.klaviyo_account_id)) {
        connectionsWithoutFooter.push({ ...conn, isOwn: false })
      }
    }

    return NextResponse.json({ connectionsWithoutFooter, isTeamAdmin })

  } catch (err) {
    console.error('Footer status check error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
