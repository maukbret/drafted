import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { frames } = await request.json()

    if (!frames || !Array.isArray(frames)) {
      return NextResponse.json({ error: 'Frames array is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update each frame's link_url and alt name
    for (const frame of frames) {
      const normalizedName = typeof frame.name === 'string' && frame.name.trim().length > 0
        ? frame.name.trim()
        : 'Untitled section'

      const { error } = await supabase
        .from('frames')
        .update({
          link_url: frame.link_url || null,
          name: normalizedName,
        })
        .eq('id', frame.id)
        // RLS will ensure user can only update their own frames

      if (error) {
        console.error('Error updating frame:', error)
        return NextResponse.json({ error: 'Failed to update frame' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Update links error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
