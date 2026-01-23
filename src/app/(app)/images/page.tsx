import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ImageUploader } from '@/components/image-uploader'

export default async function ImagesPage() {
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

  const hasConnections = (klaviyoConnections?.length ?? 0) > 0 && figmaConnection

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Images</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Upload images from Figma to Klaviyo for use in drag &amp; drop templates or dynamic content blocks.
        </p>

        {hasConnections ? (
          <ImageUploader klaviyoConnections={klaviyoConnections || []} />
        ) : (
          <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {!figmaConnection && !klaviyoConnections?.length
                ? 'Connect your Figma and Klaviyo accounts to start uploading images.'
                : !figmaConnection
                ? 'Connect your Figma account to start uploading images.'
                : 'Add a Klaviyo account to start uploading images.'}
            </p>
            <Link
              href="/connections"
              className="inline-flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Set up connections
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
