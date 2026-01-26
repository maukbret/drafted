import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        const { figmaUrl, klaviyoConnectionId } = await request.json()

        if (!figmaUrl) {
          send({ type: 'error', message: 'Figma URL is required' })
          controller.close()
          return
        }

        if (!klaviyoConnectionId) {
          send({ type: 'error', message: 'Klaviyo account is required' })
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

        // Get Klaviyo connection with token
        const { data: klaviyoConnection } = await supabase
          .from('klaviyo_connections')
          .select('id, access_token, refresh_token, expires_at')
          .eq('id', klaviyoConnectionId)
          .eq('user_id', user.id)
          .single()

        if (!klaviyoConnection) {
          send({ type: 'error', message: 'Invalid Klaviyo connection' })
          controller.close()
          return
        }

        const { data: figmaConnection } = await supabase
          .from('figma_connections')
          .select('access_token')
          .eq('user_id', user.id)
          .single()

        if (!figmaConnection) {
          send({ type: 'error', message: 'Figma not connected' })
          controller.close()
          return
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

        send({ type: 'progress', message: 'Fetching frames from Figma...' })

        const figmaToken = figmaConnection.access_token

        // Get frame children from Figma
        const nodesResponse = await fetch(
          `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=1`,
          {
            headers: {
              'Authorization': `Bearer ${figmaToken}`,
            },
          }
        )

        if (!nodesResponse.ok) {
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

        // Extract children (frames/slices) or use parent if no children
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

        send({ type: 'progress', message: `Found ${nodesToExport.length} frame(s). Creating images...` })

        // Get image URLs for all nodes
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
          send({ type: 'error', message: 'Failed to get images from Figma' })
          controller.close()
          return
        }

        const imagesData = await imagesResponse.json()
        const images = imagesData.images || {}

        // Check if Klaviyo token is expired and refresh if needed
        let klaviyoToken = klaviyoConnection.access_token
        const expiresAt = new Date(klaviyoConnection.expires_at)
        const now = new Date()

        if (expiresAt <= now && klaviyoConnection.refresh_token) {
          send({ type: 'progress', message: 'Refreshing Klaviyo token...' })

          const refreshResponse = await fetch('https://a.klaviyo.com/oauth/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: klaviyoConnection.refresh_token,
              client_id: process.env.KLAVIYO_CLIENT_ID!,
              client_secret: process.env.KLAVIYO_CLIENT_SECRET!,
            }),
          })

          if (refreshResponse.ok) {
            const tokens = await refreshResponse.json()
            klaviyoToken = tokens.access_token

            await supabase
              .from('klaviyo_connections')
              .update({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token || klaviyoConnection.refresh_token,
                expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
              })
              .eq('id', klaviyoConnection.id)
          } else {
            send({ type: 'error', message: 'Klaviyo token expired. Please reconnect Klaviyo.' })
            controller.close()
            return
          }
        }

        // Upload each image to Klaviyo
        send({ type: 'progress', message: 'Uploading images to Klaviyo...' })

        for (let i = 0; i < nodesToExport.length; i++) {
          const node = nodesToExport[i]
          const imageUrl = images[node.id]

          if (!imageUrl) {
            console.log(`Skipping ${node.name} - no image URL`)
            continue
          }

          send({ type: 'progress', message: `Uploading ${i + 1}/${nodesToExport.length}: ${node.name}` })

          try {
            const uploadResponse = await fetch('https://a.klaviyo.com/api/images', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${klaviyoToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'revision': '2024-06-15',
              },
              body: JSON.stringify({
                data: {
                  type: 'image',
                  attributes: {
                    name: node.name,
                    import_from_url: imageUrl,
                    hidden: false,
                  },
                },
              }),
            })

            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json()
              const klaviyoImageUrl = uploadData.data?.attributes?.image_url

              if (klaviyoImageUrl) {
                send({
                  type: 'image',
                  name: node.name,
                  originalUrl: imageUrl,
                  klaviyoUrl: klaviyoImageUrl,
                })
              }
            } else {
              const errorText = await uploadResponse.text()
              console.error(`Failed to upload ${node.name}:`, errorText)
            }
          } catch (err) {
            console.error(`Error uploading ${node.name}:`, err)
          }
        }

        send({ type: 'done' })

      } catch (err) {
        console.error('Image upload error:', err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Internal server error' })
      }

      controller.close()
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}
