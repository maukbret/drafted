import { createClient } from '@/lib/supabase/server'
import { isAnalyticsPaused } from '@/lib/analytics-feature'
import { redirect } from 'next/navigation'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'
import { canAccessAnalytics } from '@/lib/feature-access'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!canAccessAnalytics(user.id)) redirect('/campaigns')

  if (isAnalyticsPaused()) {
    return (
      <div className="p-8">
        <div className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-bold text-amber-900">Analytics is paused</h1>
          <p className="mt-2 text-sm text-amber-800">
            Klaviyo analytics sync and dashboard data loading are temporarily disabled to reduce Supabase usage.
          </p>
        </div>
      </div>
    )
  }

  // Get user's team membership + role
  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single()

  // Get user's own connections
  const { data: ownConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, store_url, scope, analytics_synced_through')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Only admins can see team connections for analytics
  let teamConnections: typeof ownConnections = []
  if (teamMembership?.role === 'admin') {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamMembership.team_id)
      .single()

    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')
      .neq('user_id', user.id) // exclude self (already in ownConnections)

    if (adminMembers && adminMembers.length > 0) {
      const { data: tc } = await supabase
        .from('klaviyo_connections')
        .select('id, account_name, store_url, scope, analytics_synced_through')
        .in('user_id', adminMembers.map((m) => m.user_id))
        .order('created_at', { ascending: false })

      const ownerName = team?.name || 'Team'
      teamConnections = (tc || []).map((conn) => ({
        ...conn,
        owner_name: ownerName,
      }))
    }
  }

  const allConnections = [
    ...(ownConnections || []),
    ...(teamConnections || []),
  ]

  return (
    <div className="p-8">
      <AnalyticsDashboard
        connections={allConnections}
        userId={user.id}
      />
    </div>
  )
}
