import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const figmaUrl = request.nextUrl.searchParams.get('url')
    if (!figmaUrl) {
      return NextResponse.json({ exists: false })
    }

    const fileKeyMatch = figmaUrl.match(/\/design\/([^\/]+)/)
    const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/)

    if (!fileKeyMatch || !nodeIdMatch) {
      return NextResponse.json({ exists: false })
    }

    const fileKey = fileKeyMatch[1]
    const nodeId = nodeIdMatch[1].replace('-', ':')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ exists: false })
    }

    // Find the most recent ready project with matching file key + node ID from this user
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, created_at, figma_url')
      .eq('user_id', user.id)
      .eq('figma_file_key', fileKey)
      .eq('figma_node_id', nodeId)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!project) {
      return NextResponse.json({ exists: false })
    }

    // Count frames to confirm it's a complete import
    const { count } = await supabase
      .from('frames')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)

    if (!count || count === 0) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      projectName: project.name,
      frameCount: count,
      importedAt: project.created_at,
    })
  } catch {
    return NextResponse.json({ exists: false })
  }
}
