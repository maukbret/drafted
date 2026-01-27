import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConnectionsTabs } from '@/components/connections-tabs'

export default async function ConnectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get all Klaviyo connections with account IDs
  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, klaviyo_account_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Get all footers for this user
  const { data: footers } = await supabase
    .from('klaviyo_footers')
    .select('klaviyo_account_id')
    .eq('user_id', user.id)

  // Create a set of account IDs that have footers
  const accountsWithFooters = new Set(footers?.map(f => f.klaviyo_account_id) || [])

  // Add hasFooter flag to each connection
  const connectionsWithFooterStatus = (klaviyoConnections || []).map(conn => ({
    ...conn,
    hasFooter: conn.klaviyo_account_id ? accountsWithFooters.has(conn.klaviyo_account_id) : false,
  }))

  // Get Figma connection
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id, figma_email, created_at')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="p-8">
      <ConnectionsTabs
        klaviyoConnections={connectionsWithFooterStatus}
        figmaConnection={figmaConnection}
      />
    </div>
  )
}
