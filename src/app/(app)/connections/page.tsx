import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConnectionsTabs } from '@/components/connections-tabs'

export default async function ConnectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get subscription to determine connection limit
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('price_tier')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .single()

  // Connection limits by tier
  const tierLimits: Record<string, number> = {
    starter: 1,
    advanced: 5,
    pro: 20,
  }
  const connectionLimit = subscription?.price_tier
    ? tierLimits[subscription.price_tier] || 0
    : 0
  const currentTier = subscription?.price_tier || null

  // Get all Klaviyo connections with account IDs
  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, klaviyo_account_id, created_at, user_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Get user's team membership
  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single()

  // Get team name (for shared connection labeling)
  const { data: team } = teamMembership
    ? await supabase
        .from('teams')
        .select('name')
        .eq('id', teamMembership.team_id)
        .single()
    : { data: null }

  // Get team admin's connections (if user is in a team)
  let teamAdminIds: string[] = []
  let teamConnections: typeof klaviyoConnections = []
  if (teamMembership) {
    // Get admin members (without profile join - no FK relationship exists)
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')

    if (adminMembers && adminMembers.length > 0) {
      teamAdminIds = adminMembers.map(m => m.user_id)
      const adminUserIds = teamAdminIds.filter(id => id !== user.id)

      const { data: adminConnections } = await supabase
        .from('klaviyo_connections')
        .select('id, account_name, klaviyo_account_id, created_at, user_id')
        .in('user_id', adminUserIds)
        .order('created_at', { ascending: false })

      const fallbackTeamName = team?.name || 'Team'
      teamConnections = (adminConnections || []).map(conn => ({
        ...conn,
        owner_name: fallbackTeamName,
      }))
    }
  }

  // Get all footers for this user
  const { data: footers } = await supabase
    .from('klaviyo_footers')
    .select('klaviyo_account_id')
    .eq('user_id', user.id)

  // Also get team admin's footers (supports multiple admins regardless of viewer role)
  let teamFooters: typeof footers = []
  if (teamAdminIds.length > 0) {
    const { data: adminFooters } = await supabase
      .from('klaviyo_footers')
      .select('klaviyo_account_id')
      .in('user_id', teamAdminIds)

    teamFooters = adminFooters || []
  }

  // Get default audiences for this user
  const { data: defaultAudiences } = await supabase
    .from('klaviyo_default_audiences')
    .select('user_id, klaviyo_account_id')
    .eq('user_id', user.id)

  // Also get team admin default audiences (shared)
  let teamDefaultAudiences: typeof defaultAudiences = []
  if (teamAdminIds.length > 0) {
    const { data: adminDefaultAudiences } = await supabase
      .from('klaviyo_default_audiences')
      .select('user_id, klaviyo_account_id')
      .in('user_id', teamAdminIds)

    teamDefaultAudiences = adminDefaultAudiences || []
  }

  // Create a set of account IDs that have footers
  const accountsWithFooters = new Set([
    ...(footers?.map(f => f.klaviyo_account_id) || []),
    ...(teamFooters?.map(f => f.klaviyo_account_id) || [])
  ])

  const accountsWithDefaultAudiences = new Set(
    [...(defaultAudiences || []), ...(teamDefaultAudiences || [])]
      .map((defaultAudience) => `${defaultAudience.user_id}:${defaultAudience.klaviyo_account_id}`)
  )

  // Add hasFooter flag to each connection
  const connectionsWithFooterStatus = (klaviyoConnections || []).map(conn => ({
    ...conn,
    hasFooter: conn.klaviyo_account_id ? accountsWithFooters.has(conn.klaviyo_account_id) : false,
    hasDefaultAudience: conn.klaviyo_account_id
      ? accountsWithDefaultAudiences.has(`${conn.user_id}:${conn.klaviyo_account_id}`)
      : false,
    isShared: false,
  }))

  // Add team connections with shared flag
  const teamConnectionsWithStatus = (teamConnections || []).map(conn => ({
    ...conn,
    hasFooter: conn.klaviyo_account_id ? accountsWithFooters.has(conn.klaviyo_account_id) : false,
    hasDefaultAudience: conn.klaviyo_account_id
      ? accountsWithDefaultAudiences.has(`${conn.user_id}:${conn.klaviyo_account_id}`)
      : false,
    isShared: true,
  }))

  // Get Figma connection
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id, figma_email, created_at')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="p-8">
      <ConnectionsTabs
        klaviyoConnections={connectionsWithFooterStatus}
        teamConnections={teamConnectionsWithStatus}
        figmaConnection={figmaConnection}
        connectionLimit={connectionLimit}
        currentTier={currentTier}
        isTeamAdmin={teamMembership?.role === 'admin'}
        currentUserId={user.id}
      />
    </div>
  )
}
