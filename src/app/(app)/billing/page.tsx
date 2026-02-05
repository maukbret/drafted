import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BillingPageClient } from './billing-page-client'
import type { Subscription } from '@/types/database'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch subscription data and Klaviyo connection count in parallel
  const [{ data: subscription }, { count: klaviyoConnectionCount }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('klaviyo_connections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  return (
    <BillingPageClient
      subscription={subscription as Subscription | null}
      klaviyoConnectionCount={klaviyoConnectionCount || 0}
    />
  )
}
