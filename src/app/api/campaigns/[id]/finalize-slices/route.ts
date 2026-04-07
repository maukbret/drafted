import { createClient } from '@/lib/supabase/server'
import { deleteFrameImagesForProjectExceptUrls } from '@/lib/frame-images-server'
import { NextRequest, NextResponse } from 'next/server'

interface SliceInput {
  imageUrl: string
  width: number
  name: string
  linkUrl: string
  displayOrder: number
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const { slices, sliceLayout } = await request.json() as {
      slices: SliceInput[]
      sliceLayout?: unknown
    }

    if (!slices || !Array.isArray(slices) || slices.length === 0) {
      return NextResponse.json({ error: 'Slices array is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the campaign and verify ownership
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('project_id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (!campaign || !campaign.project_id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const projectId = campaign.project_id

    const { data: projectRow } = await supabase
      .from('projects')
      .select('slice_master_image_url')
      .eq('id', projectId)
      .single()

    let sliceMasterImageUrl: string | null =
      (projectRow?.slice_master_image_url as string | null) || null

    if (!sliceMasterImageUrl) {
      const { data: oldFrames } = await supabase
        .from('frames')
        .select('image_url, width')
        .eq('project_id', projectId)
        .order('display_order', { ascending: true })

      const wide =
        oldFrames?.find(f => (f.width ?? 0) >= 550 && f.image_url)?.image_url ?? null
      const sole = oldFrames?.length === 1 ? oldFrames[0].image_url : null
      sliceMasterImageUrl = wide || sole || null
    }

    // Delete existing frames for this project
    await supabase
      .from('frames')
      .delete()
      .eq('project_id', projectId)

    // Create new frame records from slices
    const framesToInsert = slices.map((slice) => ({
      project_id: projectId,
      figma_node_id: `slice-${slice.displayOrder}`,
      name: slice.name || 'Untitled section',
      width: slice.width,
      image_url: slice.imageUrl,
      link_url: slice.linkUrl || null,
      display_order: slice.displayOrder,
    }))

    const { data: frames, error: framesError } = await supabase
      .from('frames')
      .insert(framesToInsert)
      .select()

    if (framesError) {
      console.error('Frames creation error:', framesError)
      return NextResponse.json({ error: 'Failed to create frames' }, { status: 500 })
    }

    await deleteFrameImagesForProjectExceptUrls(
      user.id,
      projectId,
      slices.map(slice => slice.imageUrl)
    )

    await supabase
      .from('projects')
      .update({
        slice_master_image_url: sliceMasterImageUrl,
        slice_layout_json: sliceLayout ?? null,
      })
      .eq('id', projectId)

    return NextResponse.json({ frames: frames || [] })
  } catch (err) {
    console.error('Finalize slices error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
