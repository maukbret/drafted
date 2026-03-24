import { createClient } from '@/lib/supabase/server'
import { ensureKlaviyoAccountId } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'

// GET - Retrieve product feed preset for a connection
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
    let presetOwnerId = connection.user_id
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

    const klaviyoAccountId = connection.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, connectionId)
    if (!klaviyoAccountId) {
      return NextResponse.json({ preset: null })
    }

    const { data: preset } = await supabase
      .from('product_feed_presets')
      .select('*')
      .eq('user_id', presetOwnerId)
      .eq('klaviyo_account_id', klaviyoAccountId)
      .single()

    return NextResponse.json({ preset: preset || null })

  } catch (err) {
    console.error('Get product feed preset error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Save product feed preset for a connection
export async function POST(request: NextRequest) {
  try {
    const { connectionId, layout, buttonColor, buttonTextColor, buttonText, showPrice, showTitle, imageRatio } = await request.json()

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('klaviyo_account_id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const klaviyoAccountId = connection.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, connectionId)
    if (!klaviyoAccountId) {
      return NextResponse.json({
        error: 'This Klaviyo connection does not have an account ID. Please reconnect your Klaviyo account.'
      }, { status: 400 })
    }

    const { data: preset, error: upsertError } = await supabase
      .from('product_feed_presets')
      .upsert({
        user_id: user.id,
        klaviyo_account_id: klaviyoAccountId,
        layout: layout || '2-column',
        button_color: buttonColor || '#000000',
        button_text_color: buttonTextColor || '#ffffff',
        button_text: buttonText || 'Shop now',
        show_price: showPrice ?? true,
        show_title: showTitle ?? true,
        image_ratio: imageRatio || 'square',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,klaviyo_account_id',
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Product feed preset upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save preset' }, { status: 500 })
    }

    return NextResponse.json({ success: true, preset })

  } catch (err) {
    console.error('Save product feed preset error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Remove product feed preset for a connection
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

    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('klaviyo_account_id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const klaviyoAccountId = connection.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, connectionId)
    if (!klaviyoAccountId) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    await supabase
      .from('product_feed_presets')
      .delete()
      .eq('user_id', user.id)
      .eq('klaviyo_account_id', klaviyoAccountId)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete product feed preset error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
