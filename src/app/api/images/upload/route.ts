import { createClient } from '@/lib/supabase/server'
import {
  buildFigmaRateLimitMessage,
  FigmaRateLimitDetails,
  FigmaRateLimitError,
  figmaApiFetch,
  getFigmaImageExportScale,
} from '@/lib/figma'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextRequest } from 'next/server'

function buildRateLimitedPayload(details: FigmaRateLimitDetails) {
  return {
    type: 'error' as const,
    code: 'figma_rate_limited',
    message: buildFigmaRateLimitMessage(details),
    retryAfterSec: details.retryAfterSec,
    retryAt: new Date(Date.now() + details.retryAfterSec * 1000).toISOString(),
    planTier: details.planTier,
    rateLimitType: details.rateLimitType,
    upgradeUrl: details.upgradeUrl,
  }
}

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
        const figmaCooldownKey = `${user.id}:${fileKey}`

        // Get frame children from Figma
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
            send(buildRateLimitedPayload(err.details))
            controller.close()
            return
          }
          throw err
        }

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

        send({ type: 'progress', message: `Found ${nodesToExport.length} frame(s). Creating images...` })

        // Get image URLs for all nodes, grouped by scale so each node targets 1080px export width.
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
              `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIdsForScale.join(','))}&format=png&scale=${scale}`,
              {
                accessToken: figmaToken,
                cooldownKey: figmaCooldownKey,
                max429Retries: 1,
                maxAutoRetryAfterSec: 20,
              }
            )
          } catch (err) {
            if (err instanceof FigmaRateLimitError) {
              send(buildRateLimitedPayload(err.details))
              controller.close()
              return
            }
            throw err
          }

          if (!imagesResponse.ok) {
            send({ type: 'error', message: 'Failed to get images from Figma' })
            controller.close()
            return
          }

          const imagesData = await imagesResponse.json()
          Object.assign(images, imagesData.images || {})
        }

        // Get valid Klaviyo token (refreshes automatically if needed)
        const klaviyoToken = await getValidKlaviyoToken(supabase, klaviyoConnection.id)

        if (!klaviyoToken) {
          send({ type: 'error', message: 'Klaviyo token expired. Please reconnect Klaviyo.' })
          controller.close()
          return
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
                'revision': '2026-01-15',
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
