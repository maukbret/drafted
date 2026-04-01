import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Klaviyo proxy APIs (audiences, campaigns, footer, etc.): owner, team admin for any
 * teammate's connection, or team member using a connection owned by a team admin (shared).
 */
export async function userCanUseKlaviyoConnection(
  supabase: SupabaseClient,
  userId: string,
  connectionOwnerId: string
): Promise<boolean> {
  if (connectionOwnerId === userId) return true

  const { data: myMemberships } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)

  if (!myMemberships?.length) return false

  const myTeamIds = myMemberships.map((m) => m.team_id)

  const adminTeamIds = myMemberships.filter((m) => m.role === 'admin').map((m) => m.team_id)
  if (adminTeamIds.length > 0) {
    const { data: ownerRow } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('user_id', connectionOwnerId)
      .in('team_id', adminTeamIds)
      .maybeSingle()

    if (ownerRow) return true
  }

  const { data: ownerAsAdmin } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', connectionOwnerId)
    .eq('role', 'admin')
    .in('team_id', myTeamIds)
    .maybeSingle()

  return !!ownerAsAdmin
}

/** Owner-only settings (footers, default audiences): owner or team admin of their team. */
export async function userCanManageKlaviyoConnectionSettings(
  supabase: SupabaseClient,
  userId: string,
  connectionOwnerId: string
): Promise<boolean> {
  if (connectionOwnerId === userId) return true

  const { data: adminMembership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('role', 'admin')

  const adminTeamIds = (adminMembership || []).map((m) => m.team_id)
  if (adminTeamIds.length === 0) return false

  const { data: ownerRow } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('user_id', connectionOwnerId)
    .in('team_id', adminTeamIds)
    .maybeSingle()

  return !!ownerRow
}
