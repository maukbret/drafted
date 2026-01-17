import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NewImportForm } from '@/components/new-import-form'
import { ProjectList } from '@/components/project-list'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get all Klaviyo connections for this user
  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Check if user has connected Figma
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id')
    .eq('user_id', user.id)
    .single()

  // Get recent projects (last 5)
  const { data: recentProjects } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      figma_url,
      status,
      created_at,
      klaviyo_connections (
        account_name
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const hasConnections = (klaviyoConnections?.length ?? 0) > 0 && figmaConnection

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-8">Dashboard</h1>

        {/* New import section */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">New import</h2>
          
          {hasConnections ? (
            <NewImportForm klaviyoConnections={klaviyoConnections || []} />
          ) : (
            <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {!figmaConnection && !klaviyoConnections?.length
                  ? 'Connect your Figma and Klaviyo accounts to start importing designs.'
                  : !figmaConnection
                  ? 'Connect your Figma account to start importing designs.'
                  : 'Add a Klaviyo account to start importing designs.'}
              </p>
              <Link
                href="/dashboard/connections"
                className="inline-flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                Set up connections
              </Link>
            </div>
          )}
        </section>

        {/* Recent imports section */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent imports</h2>
          <ProjectList projects={(recentProjects || []).map(p => ({
            ...p,
            klaviyo_connections: p.klaviyo_connections?.[0] || null
          }))} />
        </section>
      </div>
    </div>
  )
}
