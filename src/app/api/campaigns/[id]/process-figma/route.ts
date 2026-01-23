import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        const { figmaUrl } = await request.json()

        if (!figmaUrl) {
          send({ type: 'error', message: 'Figma URL is required' })
          controller.close()
          return
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          send({ type: 'error', message: 'Unauthorized' })
          controller.close()
          return
        }

        send({ type: 'progress', message: 'Verifying campaign...' })

        // Get the campaign and verify ownership
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('*, klaviyo_connections(id)')
          .eq('id', campaignId)
          .eq('user_id', user.id)
          .single()

        if (!campaign) {
          send({ type: 'error', message: 'Campaign not found' })
          controller.close()
          return
        }

        // Get user's Figma connection
        const { data: figmaConnection } = await supabase
          .from('figma_connections')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', user.id)
          .single()

        if (!figmaConnection) {
          send({ type: 'error', message: 'Figma not connected' })
          controller.close()
          return
        }

        // Check if token is expired and refresh if needed
        let figmaToken = figmaConnection.access_token
        const expiresAt = new Date(figmaConnection.expires_at)
        const now = new Date()

        if (expiresAt <= now && figmaConnection.refresh_token) {
          send({ type: 'progress', message: 'Refreshing Figma token...' })

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
            send({ type: 'error', message: 'Figma token expired. Please reconnect Figma.' })
            controller.close()
            return
          }
        }

        // Parse Figma URL
        const fileKeyMatch = figmaUrl.match(/\/design\/([^\/]+)/)
        const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/)

        if (!fileKeyMatch) {
          send({ type: 'error', message: 'Invalid Figma URL - could not extract file key' })
          controller.close()
          return
        }

        const fileKey = fileKeyMatch[1]
        const nodeId = nodeIdMatch ? nodeIdMatch[1].replace('-', ':') : null

        if (!nodeId) {
          send({ type: 'error', message: 'Invalid Figma URL - please include a node-id parameter' })
          controller.close()
          return
        }

        send({ type: 'progress', message: 'Fetching frame structure from Figma...' })

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
          send({ type: 'error', message: 'Failed to fetch Figma file' })
          controller.close()
          return
        }

        const nodesData = await nodesResponse.json()
        const parentNode = nodesData.nodes[nodeId]

        if (!parentNode || !parentNode.document) {
          send({ type: 'error', message: 'Frame not found in Figma file' })
          controller.close()
          return
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

        send({ type: 'progress', message: `Found ${nodesToExport.length} frame(s). Generating images...` })

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
          send({ type: 'error', message: 'Failed to get images from Figma' })
          controller.close()
          return
        }

        const imagesData = await imagesResponse.json()
        const images = imagesData.images || {}

        send({ type: 'progress', message: 'Saving to database...' })

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
          send({ type: 'error', message: 'Failed to create project' })
          controller.close()
          return
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
          send({ type: 'error', message: 'Failed to save frames' })
          controller.close()
          return
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

        send({
          type: 'done',
          projectId: project.id,
          frameCount: nodesToExport.length,
          frames: frames || [],
        })

      } catch (err) {
        console.error('Figma processing error:', err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Internal server error' })
      }

      controller.close()
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}
