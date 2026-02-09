import { createClient } from '@/lib/supabase/server'
import { KlaviyoAudience } from '@/types/database'
import { NextRequest, NextResponse } from 'next/server'

interface StoredDefaultAudience {
  included_audiences: KlaviyoAudience[]
  excluded_audiences: KlaviyoAudience[]
}

function isKlaviyoAudience(value: unknown): value is KlaviyoAudience {
  if (!value || typeof value !== 'object') return false

  const audience = value as Partial<KlaviyoAudience>
  return (
    typeof audience.id === 'string' &&
    audience.id.length > 0 &&
    typeof audience.name === 'string' &&
    audience.name.length > 0 &&
    (audience.type === 'list' || audience.type === 'segment')
  )
}

function parseAudiences(value: unknown): KlaviyoAudience[] | null {
  if (!Array.isArray(value) || !value.every(isKlaviyoAudience)) {
    return null
  }

  // De-duplicate by audience ID while preserving order.
  const seen = new Set<string>()
  const normalized: KlaviyoAudience[] = []

  for (const audience of value) {
    if (seen.has(audience.id)) continue
    seen.add(audience.id)
    normalized.push({
      id: audience.id,
      name: audience.name,
      type: audience.type,
    })
  }

  return normalized
}

function formatDefaultAudience(defaultAudience: StoredDefaultAudience | null) {
  if (!defaultAudience) return null

  return {
    includedAudiences: defaultAudience.included_audiences || [],
    excludedAudiences: defaultAudience.excluded_audiences || [],
  }
}

async function userCanReadConnection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  connectionOwnerId: string
) {
  if (connectionOwnerId === userId) {
    return true
  }

  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)

  const teamIds = (memberships || []).map((membership) => membership.team_id)
  if (teamIds.length === 0) {
    return false
  }

  const { data: ownerAdminMembership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', connectionOwnerId)
    .eq('role', 'admin')
    .in('team_id', teamIds)
    .maybeSingle()

  return !!ownerAdminMembership
}

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

    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('user_id, klaviyo_account_id')
      .eq('id', connectionId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const canRead = await userCanReadConnection(supabase, user.id, connection.user_id)
    if (!canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!connection.klaviyo_account_id) {
      return NextResponse.json({ defaultAudience: null })
    }

    const { data: defaultAudience, error } = await supabase
      .from('klaviyo_default_audiences')
      .select('included_audiences, excluded_audiences')
      .eq('user_id', connection.user_id)
      .eq('klaviyo_account_id', connection.klaviyo_account_id)
      .maybeSingle()

    if (error) {
      console.error('Get default audience error:', error)
      return NextResponse.json({ error: 'Failed to fetch default audience' }, { status: 500 })
    }

    return NextResponse.json({
      defaultAudience: formatDefaultAudience(defaultAudience as StoredDefaultAudience | null),
    })
  } catch (err) {
    console.error('Get default audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const connectionId = body.connectionId as string | undefined
    const includedAudiences = parseAudiences(body.includedAudiences)
    const excludedAudiences = parseAudiences(body.excludedAudiences ?? [])

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    if (!includedAudiences || !excludedAudiences) {
      return NextResponse.json({ error: 'Invalid audience payload' }, { status: 400 })
    }

    if (includedAudiences.length === 0) {
      return NextResponse.json({ error: 'At least one included audience is required' }, { status: 400 })
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

    if (!connection.klaviyo_account_id) {
      return NextResponse.json({
        error: 'This Klaviyo connection does not have an account ID. Please reconnect your Klaviyo account.',
      }, { status: 400 })
    }

    const { data: defaultAudience, error } = await supabase
      .from('klaviyo_default_audiences')
      .upsert({
        user_id: user.id,
        klaviyo_account_id: connection.klaviyo_account_id,
        included_audiences: includedAudiences,
        excluded_audiences: excludedAudiences,
      }, {
        onConflict: 'user_id,klaviyo_account_id',
      })
      .select('included_audiences, excluded_audiences')
      .single()

    if (error) {
      console.error('Save default audience error:', error)
      return NextResponse.json({ error: 'Failed to save default audience' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      defaultAudience: formatDefaultAudience(defaultAudience as StoredDefaultAudience),
    })
  } catch (err) {
    console.error('Save default audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    if (!connection || !connection.klaviyo_account_id) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('klaviyo_default_audiences')
      .delete()
      .eq('user_id', user.id)
      .eq('klaviyo_account_id', connection.klaviyo_account_id)

    if (error) {
      console.error('Delete default audience error:', error)
      return NextResponse.json({ error: 'Failed to clear default audience' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete default audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
