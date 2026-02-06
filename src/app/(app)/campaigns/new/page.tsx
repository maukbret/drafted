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

  // Get any Klaviyo connection available to this user (own or shared via team)
  // RLS policies determine which rows are visible.
  const { data: availableConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, klaviyo_account_id')
    .order('created_at', { ascending: false })
    .limit(1)

  const connection = availableConnections?.[0] || null

  if (!connection?.id) {
    redirect('/connections')
  }

  // Create a new campaign
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      klaviyo_connection_id: connection.id,
      klaviyo_account_id: connection.klaviyo_account_id || null,
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
