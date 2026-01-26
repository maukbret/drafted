import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NewCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get the first Klaviyo connection
  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (!klaviyoConnections || klaviyoConnections.length === 0) {
    redirect('/connections')
  }

  // Create a new campaign
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      klaviyo_connection_id: klaviyoConnections[0].id,
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
