import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: ownConnections } = await supabase
      .from('klaviyo_connections')
      .select('id, account_name, klaviyo_account_id')
      .eq('user_id', user.id)

    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single()

    let teammateConnections: {
      id: string
      account_name: string | null
      klaviyo_account_id: string | null
      user_id: string
    }[] = []

    let footerOwnerIds: string[] = [user.id]

    if (teamMembership) {
      const { data: roster } = await supabase
        .from('team_members')
        .select('user_id, role')
        .eq('team_id', teamMembership.team_id)

      const members = roster || []

      if (teamMembership.role === 'admin') {
        footerOwnerIds = [...new Set(members.map((m) => m.user_id))]
        const otherIds = members.map((m) => m.user_id).filter((id) => id !== user.id)
        if (otherIds.length > 0) {
          const { data } = await supabase
            .from('klaviyo_connections')
            .select('id, account_name, klaviyo_account_id, user_id')
            .in('user_id', otherIds)
          teammateConnections = data ?? []
        }
      } else {
        const adminIds = members.filter((m) => m.role === 'admin').map((m) => m.user_id)
        footerOwnerIds = [...new Set([user.id, ...adminIds])]
        const otherAdminIds = adminIds.filter((id) => id !== user.id)
        if (otherAdminIds.length > 0) {
          const { data } = await supabase
            .from('klaviyo_connections')
            .select('id, account_name, klaviyo_account_id, user_id')
            .in('user_id', otherAdminIds)
          teammateConnections = data ?? []
        }
      }
    }

    const { data: footers } = await supabase
      .from('klaviyo_footers')
      .select('klaviyo_account_id, user_id')
      .in('user_id', footerOwnerIds)

    const accountsWithFooters = new Set(
      (footers || []).map((f) => `${f.user_id}:${f.klaviyo_account_id}`)
    )

    const connectionsWithoutFooter: {
      id: string
      account_name: string | null
      klaviyo_account_id: string | null
      isOwn: boolean
    }[] = []

    for (const conn of ownConnections || []) {
      const key = `${user.id}:${conn.klaviyo_account_id}`
      if (!conn.klaviyo_account_id || !accountsWithFooters.has(key)) {
        connectionsWithoutFooter.push({ ...conn, isOwn: true })
      }
    }

    const isTeamAdmin = teamMembership?.role === 'admin'
    for (const conn of teammateConnections) {
      const key = `${conn.user_id}:${conn.klaviyo_account_id}`
      if (!conn.klaviyo_account_id || !accountsWithFooters.has(key)) {
        connectionsWithoutFooter.push({
          id: conn.id,
          account_name: conn.account_name,
          klaviyo_account_id: conn.klaviyo_account_id,
          isOwn: false,
        })
      }
    }

    return NextResponse.json({ connectionsWithoutFooter, isTeamAdmin })

  } catch (err) {
    console.error('Footer status check error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
