import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CampaignList } from '@/components/campaign-list'
import { CampaignsHeader } from '@/components/campaigns-header'

export default async function CampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*, klaviyo_connections(account_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch Klaviyo connections for creating new campaigns
  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name')
    .eq('user_id', user.id)

  const hasConnections = !!(klaviyoConnections && klaviyoConnections.length > 0)

  return (
    <div className="p-8">
      <CampaignsHeader hasConnections={hasConnections} />
      <CampaignList campaigns={campaigns || []} />
    </div>
  )
}
