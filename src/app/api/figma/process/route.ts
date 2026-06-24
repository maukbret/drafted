import { createClient } from '@/lib/supabase/server'
import {
  buildFigmaRateLimitMessage,
  FigmaRateLimitError,
  figmaApiFetch,
  getFigmaImageExportScale,
} from '@/lib/figma'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { figmaUrl, klaviyoConnectionId } = await request.json()

    if (!figmaUrl) {
      return NextResponse.json({ error: 'Figma URL is required' }, { status: 400 })
    }

    if (!klaviyoConnectionId) {
      return NextResponse.json({ error: 'Klaviyo account is required' }, { status: 400 })
    }

    // Get current user and their Figma token
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the Klaviyo connection belongs to this user
    const { data: klaviyoConnection } = await supabase
      .from('klaviyo_connections')
      .select('id')
      .eq('id', klaviyoConnectionId)
      .eq('user_id', user.id)
      .single()

    if (!klaviyoConnection) {
      return NextResponse.json({ error: 'Invalid Klaviyo connection' }, { status: 400 })
    }

    const { data: figmaConnection } = await supabase
      .from('figma_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (!figmaConnection) {
      return NextResponse.json({ error: 'Figma not connected' }, { status: 400 })
    }

    // Parse Figma URL to extract file key and node ID
    // URL format: https://www.figma.com/design/FILE_KEY/...?node-id=NODE_ID
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

    const figmaToken = figmaConnection.access_token
    const figmaCooldownKey = `${user.id}:${fileKey}`

    // Step 1: Get frame children from Figma
    let nodesResponse: Response
    try {
      nodesResponse = await figmaApiFetch(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=1`,
        {
          accessToken: figmaToken,
          cooldownKey: figmaCooldownKey,
          max429Retries: 1,
          maxAutoRetryAfterSec: 20,
        }
      )
    } catch (err) {
      if (err instanceof FigmaRateLimitError) {
        return NextResponse.json({
          error: buildFigmaRateLimitMessage(err.details),
          code: 'figma_rate_limited',
          retryAfterSec: err.details.retryAfterSec,
          retryAt: new Date(Date.now() + err.details.retryAfterSec * 1000).toISOString(),
          planTier: err.details.planTier,
          rateLimitType: err.details.rateLimitType,
          upgradeUrl: err.details.upgradeUrl,
        }, { status: 429 })
      }
      throw err
    }

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

    // Get the frame name
    const frameName = parentNode.document.name || 'Untitled'

    // Extract children (frames/slices) or use parent if no children
    const children = parentNode.document.children || []
    const frameChildren = children
      .filter((child: any) => child.type === 'FRAME' || child.type === 'SLICE')
      .map((child: any) => ({
        id: child.id,
        name: child.name,
        type: child.type,
        width: Math.round(child.absoluteBoundingBox?.width || 0),
      }))

    let nodesToExport: Array<{ id: string; name: string; type: string; width: number }>
    if (frameChildren.length > 0) {
      nodesToExport = frameChildren
    } else {
      nodesToExport = [{
        id: nodeId,
        name: parentNode.document.name || 'Main Frame',
        type: parentNode.document.type,
        width: Math.round(parentNode.document.absoluteBoundingBox?.width || 600),
      }]
    }

    // Step 2: Get image URLs, grouped by scale so each node targets 1080px export width.
    const nodesByScale = new Map<string, string[]>()
    for (const node of nodesToExport) {
      const scale = getFigmaImageExportScale(node.width)
      const existingNodeIds = nodesByScale.get(scale) ?? []
      existingNodeIds.push(node.id)
      nodesByScale.set(scale, existingNodeIds)
    }

    const images: Record<string, string> = {}
    for (const [scale, nodeIdsForScale] of nodesByScale.entries()) {
      let imagesResponse: Response
      try {
        imagesResponse = await figmaApiFetch(
          `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIdsForScale.join(','))}&format=jpg&scale=${scale}`,
          {
            accessToken: figmaToken,
            cooldownKey: figmaCooldownKey,
            max429Retries: 1,
            maxAutoRetryAfterSec: 20,
          }
        )
      } catch (err) {
        if (err instanceof FigmaRateLimitError) {
          return NextResponse.json({
            error: buildFigmaRateLimitMessage(err.details),
            code: 'figma_rate_limited',
            retryAfterSec: err.details.retryAfterSec,
            retryAt: new Date(Date.now() + err.details.retryAfterSec * 1000).toISOString(),
            planTier: err.details.planTier,
            rateLimitType: err.details.rateLimitType,
            upgradeUrl: err.details.upgradeUrl,
          }, { status: 429 })
        }
        throw err
      }

      if (!imagesResponse.ok) {
        const errorText = await imagesResponse.text()
        console.error('Figma images API error:', errorText)
        return NextResponse.json({ error: 'Failed to get images from Figma' }, { status: 500 })
      }

      const imagesData = await imagesResponse.json()
      Object.assign(images, imagesData.images || {})
    }

    // Step 3: Create project in database
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: frameName,
        figma_url: figmaUrl,
        figma_file_key: fileKey,
        figma_node_id: nodeId,
        klaviyo_connection_id: klaviyoConnectionId,
        status: 'ready',
      })
      .select()
      .single()

    if (projectError) {
      console.error('Project creation error:', projectError)
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }

    // Step 4: Create frames in database
    const framesToInsert = nodesToExport.map((node, index) => ({
      project_id: project.id,
      figma_node_id: node.id,
      name: node.name,
      width: node.width,
      image_url: images[node.id] || null,
      display_order: index,
    }))

    const { error: framesError } = await supabase
      .from('frames')
      .insert(framesToInsert)

    if (framesError) {
      console.error('Frames creation error:', framesError)
      // Clean up project if frames failed
      await supabase.from('projects').delete().eq('id', project.id)
      return NextResponse.json({ error: 'Failed to save frames' }, { status: 500 })
    }

    return NextResponse.json({
      projectId: project.id,
      frameCount: nodesToExport.length,
    })

  } catch (err) {
    console.error('Figma processing error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
