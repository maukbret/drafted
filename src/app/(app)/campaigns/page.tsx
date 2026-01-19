import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CampaignList } from '@/components/campaign-list'

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
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Create and send email campaigns through Klaviyo
          </p>
        </div>

        {hasConnections ? (
          <Link
            href="/campaigns/new"
            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            New campaign
          </Link>
        ) : (
          <Link
            href="/connections"
            className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            Connect Klaviyo first
          </Link>
        )}
      </div>

      <CampaignList campaigns={campaigns || []} />
    </div>
  )
}
