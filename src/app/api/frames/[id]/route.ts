import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: frameId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the frame to verify ownership through project
    const { data: frame } = await supabase
      .from('frames')
      .select('id, project_id, projects(user_id)')
      .eq('id', frameId)
      .single()

    if (!frame) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }

    // Verify the user owns this frame through the project
    const project = frame.projects as { user_id: string } | null
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete the frame
    const { error: deleteError } = await supabase
      .from('frames')
      .delete()
      .eq('id', frameId)

    if (deleteError) {
      console.error('Frame deletion error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete frame' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete frame error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
