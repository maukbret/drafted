import { createClient } from '@/lib/supabase/server'
import { klaviyoFetch } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

// GET - Check if a web feed exists by name for a given connection
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')
    const feedName = searchParams.get('feedName')

    if (!connectionId || !feedName) {
      return NextResponse.json(
        { error: 'connectionId and feedName are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this connection (own or team admin's)
    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('id, user_id')
      .eq('id', connectionId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    let hasAccess = connection.user_id === user.id
    if (!hasAccess) {
      const { data: membership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .single()

      if (membership) {
        const { data: adminMember } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', membership.team_id)
          .eq('user_id', connection.user_id)
          .eq('role', 'admin')
          .single()

        if (adminMember) hasAccess = true
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Query Klaviyo Web Feeds API with name filter
    const encodedName = feedName.replace(/'/g, "\\'")
    const response = await klaviyoFetch(
      supabase,
      connectionId,
      `/api/web-feeds?filter=equals(name,'${encodeURIComponent(encodedName)}')&fields[web-feed]=name,status&page[size]=1`,
      {
        headers: { 'revision': '2025-04-15' },
      }
    )

    if (!response) {
      return NextResponse.json({ error: 'Failed to connect to Klaviyo' }, { status: 502 })
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Klaviyo Web Feeds] Error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Failed to check feed', status: response.status },
        { status: 502 }
      )
    }

    const data = await response.json()
    const feeds = data?.data || []
    const found = feeds.length > 0

    return NextResponse.json({
      found,
      feed: found ? { name: feeds[0].attributes.name, status: feeds[0].attributes.status } : null,
    })
  } catch (error) {
    console.error('[Web Feeds] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
