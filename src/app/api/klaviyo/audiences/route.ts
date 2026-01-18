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
      .select('access_token')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const klaviyoToken = connection.access_token

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
