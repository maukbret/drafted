import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NewCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Require a Figma connection before creating any campaign row.
  // This prevents orphan "in_progress" campaigns for users who can't proceed.
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (!figmaConnection || figmaConnection.length === 0) {
    redirect('/connections')
  }

  // Get the user's own Klaviyo connections
  const { data: ownConnections } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  let connectionId: string | null = ownConnections?.[0]?.id || null

  // If no own connections, check for team admin connections
  if (!connectionId) {
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single()

    if (teamMembership) {
      // Get admin members
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
          .limit(1)

        connectionId = teamConnections?.[0]?.id || null
      }
    }
  }

  if (!connectionId) {
    redirect('/connections')
  }

  // Create a new campaign
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      klaviyo_connection_id: connectionId,
      name: 'Untitled Campaign',
      subject_line: '',
      status: 'in_progress',
      wizard_step: 1,
    })
    .select()
    .single()

  if (error || !campaign) {
    console.error('Failed to create campaign:', error)
    redirect('/campaigns')
  }

  // Redirect to the campaign wizard
  redirect(`/campaigns/${campaign.id}`)
}
