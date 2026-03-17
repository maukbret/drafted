import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ImageUploader } from '@/components/image-uploader'
import { Button } from '@/components/ui/button'

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Upload images</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload images from Figma to Klaviyo for use in drag &amp; drop templates or dynamic content blocks.
          </p>
        </div>
      </div>
      {hasConnections ? (
        <ImageUploader klaviyoConnections={klaviyoConnections || []} />
      ) : (
        <div>
          <p className="text-muted-foreground mb-4">
            {!figmaConnection && !klaviyoConnections?.length
              ? 'Connect your Figma and Klaviyo accounts to start uploading images.'
              : !figmaConnection
              ? 'Connect your Figma account to start uploading images.'
              : 'Add a Klaviyo account to start uploading images.'}
          </p>
          <Button asChild>
            <Link href="/connections">Set up connections</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
