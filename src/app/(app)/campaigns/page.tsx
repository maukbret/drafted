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

  // Get user's own Klaviyo connections
  const { data: ownConnections } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('user_id', user.id)

  const ownConnectionIds = ownConnections?.map(c => c.id) || []

  // Get team admin's connections if user is in a team
  let teamConnectionIds: string[] = []
  if (teamMembership) {
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')

    if (adminMembers && adminMembers.length > 0) {
      const { data: teamConnections } = await supabase
        .from('klaviyo_connections')
        .select('id')
        .in('user_id', adminMembers.map(m => m.user_id))

      teamConnectionIds = teamConnections?.map(c => c.id) || []
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
        .select('*, klaviyo_connections(account_name)')
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

  return (
    <div className="p-8">
      <CampaignsPageClient
        hasConnections={hasConnections}
        campaigns={visibleCampaigns}
        currentUserId={user.id}
        defaultKlaviyoConnectionId={defaultKlaviyoConnectionId}
      />
    </div>
  )
}
