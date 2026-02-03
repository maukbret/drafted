import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamPageClient } from './team-page-client'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get user's team membership
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    // User is not in a team, show create team page
    return <TeamPageClient team={null} role={null} currentUserId={user.id} />
  }

  // Get team with members
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', membership.team_id)
    .single()

  if (!team) {
    return <TeamPageClient team={null} role={null} currentUserId={user.id} />
  }

  // Get team members
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

  // Combine members with profiles
  const membersWithProfiles = members?.map(member => {
    const profile = profiles?.find(p => p.id === member.user_id)
    return {
      ...member,
      profiles: profile || null,
      email: member.user_id === user.id ? user.email : undefined
    }
  }) || []

  return (
    <TeamPageClient
      team={{
        ...team,
        team_members: membersWithProfiles
      }}
      role={membership.role}
      currentUserId={user.id}
    />
  )
}
