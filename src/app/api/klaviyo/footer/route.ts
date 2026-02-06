import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET - Retrieve stored footer for a connection
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

    // Get the connection to find the Klaviyo account ID and owner
    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('klaviyo_account_id, user_id')
      .eq('id', connectionId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Allow if user owns the connection or shares a team with the owner (admin only)
    let footerOwnerId = connection.user_id
    if (connection.user_id !== user.id) {
      const { data: memberships } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)

      const teamIds = (memberships || []).map(m => m.team_id)
      if (teamIds.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const { data: adminMembership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', connection.user_id)
        .eq('role', 'admin')
        .in('team_id', teamIds)
        .maybeSingle()

      if (!adminMembership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (!connection.klaviyo_account_id) {
      return NextResponse.json({ footer: null })
    }

    // Get the footer for this Klaviyo account
    const { data: footer } = await supabase
      .from('klaviyo_footers')
      .select('*')
      .eq('user_id', footerOwnerId)
      .eq('klaviyo_account_id', connection.klaviyo_account_id)
      .single()

    return NextResponse.json({ footer: footer || null })

  } catch (err) {
    console.error('Get footer error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Save footer for a connection
export async function POST(request: NextRequest) {
  try {
    const { connectionId, footerHtml, sourceUrl } = await request.json()

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    if (!footerHtml) {
      return NextResponse.json({ error: 'Footer HTML is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the connection to find the Klaviyo account ID
    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('klaviyo_account_id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    if (!connection.klaviyo_account_id) {
      return NextResponse.json({
        error: 'This Klaviyo connection does not have an account ID. Please reconnect your Klaviyo account.'
      }, { status: 400 })
    }

    // Upsert the footer (update if exists, insert if not)
    const { data: footer, error: upsertError } = await supabase
      .from('klaviyo_footers')
      .upsert({
        user_id: user.id,
        klaviyo_account_id: connection.klaviyo_account_id,
        footer_html: footerHtml,
        source_url: sourceUrl || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,klaviyo_account_id',
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Footer upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save footer' }, { status: 500 })
    }

    return NextResponse.json({ success: true, footer })

  } catch (err) {
    console.error('Save footer error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Remove footer for a connection
export async function DELETE(request: NextRequest) {
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

    // Get the connection to find the Klaviyo account ID
    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('klaviyo_account_id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection || !connection.klaviyo_account_id) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Delete the footer
    await supabase
      .from('klaviyo_footers')
      .delete()
      .eq('user_id', user.id)
      .eq('klaviyo_account_id', connection.klaviyo_account_id)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete footer error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
