import { createClient } from '@/lib/supabase/server'
import { ensureKlaviyoAccountId } from '@/lib/klaviyo'
import { createServiceClient } from '@/lib/supabase/service'
import { KlaviyoAudience } from '@/types/database'
import { NextRequest, NextResponse } from 'next/server'

const MAX_PRESETS = 3

interface StoredPreset {
  id: string
  preset_name: string
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

function formatPreset(row: StoredPreset) {
  return {
    id: row.id,
    name: row.preset_name,
    includedAudiences: row.included_audiences || [],
    excludedAudiences: row.excluded_audiences || [],
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

async function userIsTeamAdminOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetUserId: string
) {
  // Check if userId is an admin of a team that targetUserId also belongs to
  const { data: adminMembership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('role', 'admin')

  const adminTeamIds = (adminMembership || []).map((m) => m.team_id)
  if (adminTeamIds.length === 0) return false

  const { data: targetMembership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', targetUserId)
    .in('team_id', adminTeamIds)
    .limit(1)

  return (targetMembership || []).length > 0
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

    const klaviyoAccountId = connection.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, connectionId)
    if (!klaviyoAccountId) {
      return NextResponse.json({ defaultAudience: null, presets: [] })
    }

    const { data: rows, error } = await supabase
      .from('klaviyo_default_audiences')
      .select('id, preset_name, included_audiences, excluded_audiences')
      .eq('user_id', connection.user_id)
      .eq('klaviyo_account_id', klaviyoAccountId)
      .order('created_at')
      .limit(MAX_PRESETS)

    if (error) {
      console.error('Get default audience error:', error)
      return NextResponse.json({ error: 'Failed to fetch default audience' }, { status: 500 })
    }

    const presets = (rows || []).map((row) => formatPreset(row as StoredPreset))

    // Legacy field for backward compatibility
    const firstPreset = presets[0] || null
    const defaultAudience = firstPreset
      ? { includedAudiences: firstPreset.includedAudiences, excludedAudiences: firstPreset.excludedAudiences }
      : null

    return NextResponse.json({ defaultAudience, presets })
  } catch (err) {
    console.error('Get default audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const connectionId = body.connectionId as string | undefined
    const presetId = body.presetId as string | undefined
    const presetName = (body.presetName as string | undefined)?.trim()
    const includedAudiences = parseAudiences(body.includedAudiences)
    const excludedAudiences = parseAudiences(body.excludedAudiences ?? [])

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    if (!presetName || presetName.length === 0) {
      return NextResponse.json({ error: 'Preset name is required' }, { status: 400 })
    }

    if (presetName.length > 50) {
      return NextResponse.json({ error: 'Preset name must be 50 characters or less' }, { status: 400 })
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
      .select('user_id, klaviyo_account_id')
      .eq('id', connectionId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Allow if user owns the connection or is a team admin with access
    const canWrite = connection.user_id === user.id || await userIsTeamAdminOf(supabase, user.id, connection.user_id)
    if (!canWrite) {
      return NextResponse.json({ error: 'Not authorized to manage presets for this connection' }, { status: 403 })
    }

    const klaviyoAccountId = connection.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, connectionId)
    if (!klaviyoAccountId) {
      return NextResponse.json({
        error: 'This Klaviyo connection does not have an account ID. Please reconnect your Klaviyo account.',
      }, { status: 400 })
    }

    // Presets are stored under the connection owner's user_id
    const ownerId = connection.user_id
    // Use service client to bypass RLS when a team admin manages another user's presets
    const writeClient = ownerId !== user.id ? createServiceClient() : supabase

    if (presetId) {
      // Update existing preset
      const { data: updated, error } = await writeClient
        .from('klaviyo_default_audiences')
        .update({
          preset_name: presetName,
          included_audiences: includedAudiences,
          excluded_audiences: excludedAudiences,
        })
        .eq('id', presetId)
        .eq('user_id', ownerId)
        .select('id, preset_name, included_audiences, excluded_audiences')
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'A preset with this name already exists' }, { status: 409 })
        }
        console.error('Update preset error:', error)
        return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 })
      }

      return NextResponse.json({ success: true, preset: formatPreset(updated as StoredPreset) })
    } else {
      // Create new preset - check count first
      const { count, error: countError } = await writeClient
        .from('klaviyo_default_audiences')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ownerId)
        .eq('klaviyo_account_id', klaviyoAccountId)

      if (countError) {
        console.error('Count presets error:', countError)
        return NextResponse.json({ error: 'Failed to check preset count' }, { status: 500 })
      }

      if ((count || 0) >= MAX_PRESETS) {
        return NextResponse.json({ error: `Maximum of ${MAX_PRESETS} presets allowed` }, { status: 400 })
      }

      const { data: created, error } = await writeClient
        .from('klaviyo_default_audiences')
        .insert({
          user_id: ownerId,
          klaviyo_account_id: klaviyoAccountId,
          preset_name: presetName,
          included_audiences: includedAudiences,
          excluded_audiences: excludedAudiences,
        })
        .select('id, preset_name, included_audiences, excluded_audiences')
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'A preset with this name already exists' }, { status: 409 })
        }
        console.error('Create preset error:', error)
        return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 })
      }

      return NextResponse.json({ success: true, preset: formatPreset(created as StoredPreset) })
    }
  } catch (err) {
    console.error('Save default audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')
    const presetId = searchParams.get('presetId')

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

    const klaviyoAccountId = connection.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, connectionId)
    if (!klaviyoAccountId) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const canWrite = connection.user_id === user.id || await userIsTeamAdminOf(supabase, user.id, connection.user_id)
    if (!canWrite) {
      return NextResponse.json({ error: 'Not authorized to manage presets for this connection' }, { status: 403 })
    }

    const ownerId = connection.user_id
    const writeClient = ownerId !== user.id ? createServiceClient() : supabase

    if (presetId) {
      // Delete a specific preset
      const { error } = await writeClient
        .from('klaviyo_default_audiences')
        .delete()
        .eq('id', presetId)
        .eq('user_id', ownerId)

      if (error) {
        console.error('Delete preset error:', error)
        return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 })
      }
    } else {
      // Delete all presets for this connection
      const { error } = await writeClient
        .from('klaviyo_default_audiences')
        .delete()
        .eq('user_id', ownerId)
        .eq('klaviyo_account_id', klaviyoAccountId)

      if (error) {
        console.error('Delete default audience error:', error)
        return NextResponse.json({ error: 'Failed to clear default audiences' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete default audience error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
