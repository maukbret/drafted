import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EmailEditor } from '@/components/email-editor'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EmailEditorPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get project with Klaviyo connection info
  const { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      klaviyo_connections (
        id,
        account_name
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    notFound()
  }

  const { data: frames } = await supabase
    .from('frames')
    .select('*')
    .eq('project_id', id)
    .order('display_order', { ascending: true })

  const klaviyoConnection = project.klaviyo_connections as { id: string; account_name: string | null } | null

  return (
    <div className="p-8 h-full flex flex-col">
      <header className="mb-6 flex-shrink-0">
        <Link
          href="/template-importer"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white mb-2 inline-block"
        >
          ← Back to Template Importer
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{project.name || 'Edit email'}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Add links to each section, then export to Klaviyo
            </p>
          </div>
          {klaviyoConnection && (
            <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
              {klaviyoConnection.account_name || 'Klaviyo account'}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <EmailEditor
          projectId={project.id}
          frames={frames || []}
          klaviyoConnected={!!klaviyoConnection}
        />
      </div>
    </div>
  )
}
