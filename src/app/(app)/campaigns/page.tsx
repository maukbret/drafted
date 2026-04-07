import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CampaignsPageClient } from '@/components/campaigns-page-client'

export default async function CampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get user's team membership
  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single()

  const { data: team } = teamMembership
    ? await supabase
        .from('teams')
        .select('name')
        .eq('id', teamMembership.team_id)
        .single()
    : { data: null }

  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, store_url')
    .eq('user_id', user.id)

  const ownConnectionIds = klaviyoConnections?.map((c) => c.id) || []

  let teamConnections: { id: string; account_name: string | null; store_url?: string | null; owner_name?: string }[] = []
  let teamConnectionIds: string[] = []
  if (teamMembership) {
    const fallbackTeamName = team?.name || 'Team'

    if (teamMembership.role === 'admin') {
      const { data: teammates } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .neq('user_id', user.id)

      const teammateIds = teammates?.map((m) => m.user_id) || []
      if (teammateIds.length > 0) {
        const { data: teammateConns } = await supabase
          .from('klaviyo_connections')
          .select('id, account_name, store_url, user_id')
          .in('user_id', teammateIds)

        teamConnections = (teammateConns || []).map((conn) => ({
          id: conn.id,
          account_name: conn.account_name,
          store_url: conn.store_url,
          owner_name: fallbackTeamName,
        }))
        teamConnectionIds = teamConnections.map((c) => c.id)
      }
    } else {
      const { data: adminMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .eq('role', 'admin')

      if (adminMembers && adminMembers.length > 0) {
        const adminUserIds = adminMembers.map((m) => m.user_id).filter((id) => id !== user.id)

        if (adminUserIds.length > 0) {
          const { data: adminConnections } = await supabase
            .from('klaviyo_connections')
            .select('id, account_name, store_url, user_id')
            .in('user_id', adminUserIds)

          teamConnections = (adminConnections || []).map((conn) => ({
            id: conn.id,
            account_name: conn.account_name,
            store_url: conn.store_url,
            owner_name: fallbackTeamName,
          }))
          teamConnectionIds = teamConnections.map((c) => c.id)
        }
      }
    }
  }

  // All connection IDs the user has access to
  const accessibleConnectionIds = [...new Set([...ownConnectionIds, ...teamConnectionIds])]
  const hasConnections = accessibleConnectionIds.length > 0

  const { data: defaultConnection } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)

  const defaultKlaviyoConnectionId = defaultConnection?.[0]?.id || null

  // Fetch campaigns that use connections the user has access to
  // This ensures ex-members can't see campaigns using team connections after leaving
  const { data: campaigns } = accessibleConnectionIds.length > 0
    ? await supabase
        .from('campaigns')
        .select('*, klaviyo_connections(account_name, store_url)')
        .in('klaviyo_connection_id', accessibleConnectionIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Fetch profiles separately for campaign creators
  const creatorIds = [...new Set(campaigns?.map(c => c.user_id) || [])]
  const { data: profiles } = creatorIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', creatorIds)
    : { data: [] }

  // Add creator info and check if it's the current user's campaign
  const campaignsWithCreator = (campaigns || []).map(campaign => {
    const creatorProfile = profiles?.find(p => p.id === campaign.user_id)
    return {
      ...campaign,
      is_own: campaign.user_id === user.id,
      creator_name: creatorProfile?.full_name || null,
      creator_avatar_url: creatorProfile?.avatar_url || null,
    }
  })

  // Hide step-1 drafts from other team members to avoid clutter.
  const visibleCampaigns = campaignsWithCreator.filter(
    (campaign) => !(campaign.user_id !== user.id && campaign.wizard_step === 1)
  )

  const isTeamAdmin = teamMembership?.role === 'admin'

  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const hasFigmaConnection = !!figmaConnection

  return (
    <div className="p-8">
      <CampaignsPageClient
        hasConnections={hasConnections}
        campaigns={visibleCampaigns}
        currentUserId={user.id}
        defaultKlaviyoConnectionId={defaultKlaviyoConnectionId}
        isTeamAdmin={isTeamAdmin}
        klaviyoConnections={klaviyoConnections || []}
        teamConnections={teamConnections}
        hasFigmaConnection={hasFigmaConnection}
      />
    </div>
  )
}
