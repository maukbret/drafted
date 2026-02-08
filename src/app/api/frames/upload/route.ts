import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const image = formData.get('image') as Blob | null
    const projectId = formData.get('projectId') as string | null
    const fileName = formData.get('fileName') as string | null

    if (!image || !projectId || !fileName) {
      return NextResponse.json({ error: 'image, projectId, and fileName are required' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const storagePath = `${user.id}/${projectId}/${fileName}.png`
    const arrayBuffer = await image.arrayBuffer()

    const { error: uploadError } = await supabaseAdmin.storage
      .from('frame-images')
      .upload(storagePath, arrayBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('frame-images')
      .getPublicUrl(storagePath)

    return NextResponse.json({ url: publicUrlData.publicUrl })
  } catch (err) {
    console.error('Frame upload error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
