import { createClient } from '@/lib/supabase/server'
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

    // Get the Klaviyo connection
    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Check if token is expired and refresh if needed
    let klaviyoToken = connection.access_token
    const expiresAt = new Date(connection.expires_at)
    const now = new Date()

    if (expiresAt <= now && connection.refresh_token) {
      // Token is expired, refresh it
      const refreshResponse = await fetch('https://a.klaviyo.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connection.refresh_token,
          client_id: process.env.KLAVIYO_CLIENT_ID!,
          client_secret: process.env.KLAVIYO_CLIENT_SECRET!,
        }),
      })

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json()
        klaviyoToken = tokens.access_token

        // Update the stored token
        await supabase
          .from('klaviyo_connections')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || connection.refresh_token,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('id', connectionId)
      } else {
        console.error('Failed to refresh Klaviyo token:', await refreshResponse.text())
        return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect Klaviyo.' }, { status: 401 })
      }
    }

    // Fetch lists and segments in parallel
    const [listsResponse, segmentsResponse] = await Promise.all([
      fetch('https://a.klaviyo.com/api/lists', {
        headers: {
          'Authorization': `Bearer ${klaviyoToken}`,
          'Accept': 'application/json',
          'revision': '2024-10-15',
        },
      }),
      fetch('https://a.klaviyo.com/api/segments', {
        headers: {
          'Authorization': `Bearer ${klaviyoToken}`,
          'Accept': 'application/json',
          'revision': '2024-10-15',
        },
      }),
    ])

    if (!listsResponse.ok || !segmentsResponse.ok) {
      console.error('Klaviyo API error:', {
        lists: listsResponse.status,
        segments: segmentsResponse.status,
      })
      return NextResponse.json({ error: 'Failed to fetch audiences from Klaviyo' }, { status: 500 })
    }

    const [listsData, segmentsData] = await Promise.all([
      listsResponse.json(),
      segmentsResponse.json(),
    ])

    // Transform to common format
    const lists = (listsData.data || []).map((list: any) => ({
      id: list.id,
      name: list.attributes?.name || 'Unnamed List',
      type: 'list' as const,
    }))

    const segments = (segmentsData.data || []).map((segment: any) => ({
      id: segment.id,
      name: segment.attributes?.name || 'Unnamed Segment',
      type: 'segment' as const,
    }))

    return NextResponse.json({
      audiences: [...lists, ...segments],
    })

  } catch (err) {
    console.error('Fetch audiences error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
