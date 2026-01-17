import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConnectionsTabs } from '@/components/connections-tabs'

export default async function ConnectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get all Klaviyo connections
  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Get Figma connection
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id, figma_email, created_at')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-8">Connections</h1>
        <ConnectionsTabs
          klaviyoConnections={klaviyoConnections || []}
          figmaConnection={figmaConnection}
        />
      </div>
    </div>
  )
}
