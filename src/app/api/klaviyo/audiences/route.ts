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

    const fetchAllPages = async (baseUrl: string) => {
      const items: any[] = []
      let nextUrl: string | null = baseUrl
      let pageCount = 0
      const maxPages = 200

      while (nextUrl && pageCount < maxPages) {
        const response = await fetch(nextUrl, { headers })
        if (!response.ok) {
          throw new Error(`Klaviyo API error ${response.status} for ${baseUrl}`)
        }
        const data = await response.json()
        items.push(...(data.data || []))
        nextUrl = data.links?.next || null
        pageCount += 1
      }

      if (pageCount >= maxPages) {
        console.error('Klaviyo pagination exceeded max pages for', baseUrl)
      }

      return items
    }

    // Fetch all lists and segments in parallel (pagination-aware)
    const [listsData, segmentsData] = await Promise.all([
      fetchAllPages('https://a.klaviyo.com/api/lists'),
      fetchAllPages('https://a.klaviyo.com/api/segments'),
    ])

    // Transform to common format
    const lists = (listsData || []).map((list: any) => ({
      id: list.id,
      name: list.attributes?.name || 'Unnamed List',
      type: 'list' as const,
    }))

    const segments = (segmentsData || []).map((segment: any) => ({
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
