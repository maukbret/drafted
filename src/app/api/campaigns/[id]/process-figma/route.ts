import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const { figmaUrl } = await request.json()

    if (!figmaUrl) {
      return NextResponse.json({ error: 'Figma URL is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the campaign and verify ownership
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, klaviyo_connections(id)')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get user's Figma connection
    const { data: figmaConnection } = await supabase
      .from('figma_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (!figmaConnection) {
      return NextResponse.json({ error: 'Figma not connected' }, { status: 400 })
    }

    // Check if token is expired and refresh if needed
    let figmaToken = figmaConnection.access_token
    const expiresAt = new Date(figmaConnection.expires_at)
    const now = new Date()

    if (expiresAt <= now && figmaConnection.refresh_token) {
      // Token is expired, refresh it
      const refreshResponse = await fetch('https://api.figma.com/v1/oauth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.FIGMA_CLIENT_ID!,
          client_secret: process.env.FIGMA_CLIENT_SECRET!,
          refresh_token: figmaConnection.refresh_token,
        }),
      })

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json()
        figmaToken = tokens.access_token

        // Update the stored token
        await supabase
          .from('figma_connections')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || figmaConnection.refresh_token,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('user_id', user.id)
      } else {
        console.error('Failed to refresh Figma token:', await refreshResponse.text())
        return NextResponse.json({ error: 'Figma token expired. Please reconnect Figma.' }, { status: 401 })
      }
    }

    // Parse Figma URL
    const fileKeyMatch = figmaUrl.match(/\/design\/([^\/]+)/)
    const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/)

    if (!fileKeyMatch) {
      return NextResponse.json({ error: 'Invalid Figma URL - could not extract file key' }, { status: 400 })
    }

    const fileKey = fileKeyMatch[1]
    const nodeId = nodeIdMatch ? nodeIdMatch[1].replace('-', ':') : null

    if (!nodeId) {
      return NextResponse.json({ error: 'Invalid Figma URL - please include a node-id parameter' }, { status: 400 })
    }

    // Fetch frame children from Figma
    const nodesResponse = await fetch(
      `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=1`,
      {
        headers: {
          'Authorization': `Bearer ${figmaToken}`,
        },
      }
    )

    if (!nodesResponse.ok) {
      const errorText = await nodesResponse.text()
      console.error('Figma nodes API error:', errorText)
      return NextResponse.json({ error: 'Failed to fetch Figma file' }, { status: 500 })
    }

    const nodesData = await nodesResponse.json()
    const parentNode = nodesData.nodes[nodeId]

    if (!parentNode || !parentNode.document) {
      return NextResponse.json({ error: 'Frame not found in Figma file' }, { status: 404 })
    }

    const frameName = parentNode.document.name || 'Untitled'
    const children = parentNode.document.children || []
    const frameChildren = children
      .filter((child: any) => child.type === 'FRAME' || child.type === 'SLICE')
      .map((child: any) => ({
        id: child.id,
        name: child.name,
        type: child.type,
      }))

    let nodesToExport: Array<{ id: string; name: string; type: string }>
    if (frameChildren.length > 0) {
      nodesToExport = frameChildren
    } else {
      nodesToExport = [{
        id: nodeId,
        name: parentNode.document.name || 'Main Frame',
        type: parentNode.document.type,
      }]
    }

    // Get image URLs
    const nodeIds = nodesToExport.map(n => n.id).join(',')
    const imagesResponse = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds)}&format=png&scale=2`,
      {
        headers: {
          'Authorization': `Bearer ${figmaToken}`,
        },
      }
    )

    if (!imagesResponse.ok) {
      const errorText = await imagesResponse.text()
      console.error('Figma images API error:', errorText)
      return NextResponse.json({ error: 'Failed to get images from Figma' }, { status: 500 })
    }

    const imagesData = await imagesResponse.json()
    const images = imagesData.images || {}

    // Delete existing project and frames if campaign already has one
    if (campaign.project_id) {
      await supabase
        .from('frames')
        .delete()
        .eq('project_id', campaign.project_id)

      await supabase
        .from('projects')
        .delete()
        .eq('id', campaign.project_id)
    }

    // Create project for this campaign
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: frameName,
        figma_url: figmaUrl,
        figma_file_key: fileKey,
        figma_node_id: nodeId,
        klaviyo_connection_id: campaign.klaviyo_connection_id,
        campaign_id: campaignId,
        status: 'ready',
      })
      .select()
      .single()

    if (projectError) {
      console.error('Project creation error:', projectError)
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }

    // Create frames
    const framesToInsert = nodesToExport.map((node, index) => ({
      project_id: project.id,
      figma_node_id: node.id,
      name: node.name,
      image_url: images[node.id] || null,
      display_order: index,
    }))

    const { error: framesError } = await supabase
      .from('frames')
      .insert(framesToInsert)

    if (framesError) {
      console.error('Frames creation error:', framesError)
      await supabase.from('projects').delete().eq('id', project.id)
      return NextResponse.json({ error: 'Failed to save frames' }, { status: 500 })
    }

    // Update campaign with project reference and figma_url
    await supabase
      .from('campaigns')
      .update({
        project_id: project.id,
        figma_url: figmaUrl,
        name: campaign.name === 'Untitled Campaign' ? frameName : campaign.name,
      })
      .eq('id', campaignId)

    // Fetch the frames for the response
    const { data: frames } = await supabase
      .from('frames')
      .select('*')
      .eq('project_id', project.id)
      .order('display_order', { ascending: true })

    return NextResponse.json({
      projectId: project.id,
      frameCount: nodesToExport.length,
      frames: frames || [],
    })

  } catch (err) {
    console.error('Figma processing error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
