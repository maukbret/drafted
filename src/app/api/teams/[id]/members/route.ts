import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET - Get team members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a member of this team
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 })
    }

    // Get team members
    const { data: members, error } = await supabase
      .from('team_members')
      .select('id, team_id, user_id, role, joined_at')
      .eq('team_id', id)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('Fetch members error:', error)
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
    }

    // Get profiles for all team members
    const memberUserIds = members?.map(m => m.user_id) || []
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', memberUserIds)

    const membersWithProfiles = members?.map(member => {
      const profile = profiles?.find(p => p.id === member.user_id)
      return {
        ...member,
        profiles: profile || null,
        email: member.user_id === user.id ? user.email : undefined
      }
    }) || []

    return NextResponse.json({ members: membersWithProfiles })

  } catch (err) {
    console.error('Get members error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Remove a member from the team
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a member of this team
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 })
    }

    // Get the member to be removed
    const { data: memberToRemove } = await supabase
      .from('team_members')
      .select('user_id, role')
      .eq('id', memberId)
      .eq('team_id', id)
      .single()

    if (!memberToRemove) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const isSelfRemoval = memberToRemove.user_id === user.id

    if (!isSelfRemoval && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can remove members' }, { status: 403 })
    }

    // Prevent admin from removing themselves if they're the only admin
    if (memberToRemove.role === 'admin') {
      const { data: admins } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', id)
        .eq('role', 'admin')

      if (admins && admins.length <= 1) {
        return NextResponse.json({ error: 'Cannot remove the only admin' }, { status: 400 })
      }
    }

    const { data: deletedRows, error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', id)
      .select('id')

    if (error) {
      console.error('Remove member error:', error)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json({ error: 'Not authorized to remove member' }, { status: 403 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Remove member error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
