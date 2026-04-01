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

  // Get user's team membership
  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single()

  // Single query fetches all visible connections (RLS handles is_shared filtering)
  const { data: allConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, store_url, klaviyo_account_id, created_at, user_id, is_shared')
    .order('created_at', { ascending: false })

  // Collect unique non-own user IDs to resolve owner names
  const otherUserIds = [...new Set(
    (allConnections || [])
      .filter(c => c.user_id !== user.id)
      .map(c => c.user_id)
  )]

  // Resolve owner names from profiles
  let ownerNameMap: Record<string, string> = {}
  if (otherUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', otherUserIds)

    if (profiles) {
      ownerNameMap = Object.fromEntries(
        profiles.map(p => [p.id, p.full_name || 'Team member'])
      )
    }
  }

  // Get all footers visible to this user
  const { data: footers } = await supabase
    .from('klaviyo_footers')
    .select('klaviyo_account_id, user_id')

  // Get default audiences visible to this user
  const { data: defaultAudiences } = await supabase
    .from('klaviyo_default_audiences')
    .select('user_id, klaviyo_account_id')

  // Create sets for quick lookup
  const accountsWithFooters = new Set(
    (footers || []).map(f => `${f.user_id}:${f.klaviyo_account_id}`)
  )

  const accountsWithDefaultAudiences = new Set(
    (defaultAudiences || []).map(a => `${a.user_id}:${a.klaviyo_account_id}`)
  )

  // Map connections with computed fields
  const connections = (allConnections || []).map(conn => {
    const isOwn = conn.user_id === user.id
    const lookupKey = `${conn.user_id}:${conn.klaviyo_account_id}`
    return {
      ...conn,
      isOwn,
      ownerName: isOwn ? 'You' : (ownerNameMap[conn.user_id] || 'Team member'),
      hasFooter: conn.klaviyo_account_id ? accountsWithFooters.has(lookupKey) : false,
      hasDefaultAudience: conn.klaviyo_account_id ? accountsWithDefaultAudiences.has(lookupKey) : false,
    }
  })

  // Get Figma connection
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id, figma_email, created_at')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="p-8">
      <ConnectionsTabs
        connections={connections}
        figmaConnection={figmaConnection}
        connectionLimit={connectionLimit}
        currentTier={currentTier}
        isTeamAdmin={teamMembership?.role === 'admin'}
        currentUserId={user.id}
      />
    </div>
  )
}
