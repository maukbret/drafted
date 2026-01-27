import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CampaignList } from '@/components/campaign-list'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

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

  const hasConnections = klaviyoConnections && klaviyoConnections.length > 0

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and send email campaigns through Klaviyo
          </p>
        </div>

        {hasConnections ? (
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4 mr-1.5" />
              New campaign
            </Link>
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/connections">
              Connect Klaviyo first
            </Link>
          </Button>
        )}
      </div>

      <CampaignList campaigns={campaigns || []} />
    </div>
  )
}
