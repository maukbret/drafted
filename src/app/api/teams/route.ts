import { createRouteHandlerClient } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

// GET - Get user's team (if any)
export async function GET(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createRouteHandlerClient(request)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return applyCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }

    // Get user's team membership
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return applyCookies(NextResponse.json({ team: null }))
    }

    // Get team with members
    const { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', membership.team_id)
      .single()

    if (error) {
      console.error('Fetch team error:', error)
      return applyCookies(NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 }))
    }

    // Get team members with profiles
    const { data: members } = await supabase
      .from('team_members')
      .select('id, team_id, user_id, role, joined_at')
      .eq('team_id', membership.team_id)
      .order('joined_at', { ascending: true })

    // Get profiles for all team members
    const memberUserIds = members?.map(m => m.user_id) || []
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', memberUserIds)

    // Get user emails from auth.users (need to use admin client or RPC for this)
    // For now, we'll fetch the current user's email only
    const membersWithProfiles = members?.map(member => {
      const profile = profiles?.find(p => p.id === member.user_id)
      return {
        ...member,
        profiles: profile || null,
        email: member.user_id === user.id ? user.email : undefined
      }
    }) || []

    return applyCookies(NextResponse.json({
      team: {
        ...team,
        team_members: membersWithProfiles
      },
      membership: {
        role: membership.role,
        team_id: membership.team_id
      }
    }))

  } catch (err) {
    console.error('Get team error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new team
export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }

    const { supabase, applyCookies } = createRouteHandlerClient(request)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return applyCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }

    // Check if user is already in a team
    const { data: existingMembership } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existingMembership) {
      return applyCookies(NextResponse.json({ error: 'You are already a member of a team' }, { status: 400 }))
    }

    // Create the team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: name.trim(),
        created_by: user.id
      })
      .select()
      .single()

    if (teamError) {
      console.error('Create team error:', teamError)
      return applyCookies(NextResponse.json({ error: 'Failed to create team' }, { status: 500 }))
    }

    // Add creator as admin
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: 'admin'
      })

    if (memberError) {
      // Rollback team creation
      await supabase.from('teams').delete().eq('id', team.id)
      console.error('Add team member error:', memberError)
      return applyCookies(NextResponse.json({ error: 'Failed to create team' }, { status: 500 }))
    }

    return applyCookies(NextResponse.json({ team }))

  } catch (err) {
    console.error('Create team error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
