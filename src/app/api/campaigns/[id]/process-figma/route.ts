import { createClient } from '@/lib/supabase/server'
import { deleteFrameImagesForProject } from '@/lib/frame-images-server'
import {
  buildFigmaRateLimitMessage,
  FigmaRateLimitDetails,
  FigmaRateLimitError,
  figmaApiFetch,
  getFigmaImageExportScale,
  getFigmaCooldownSeconds,
} from '@/lib/figma'
import { createClient as createAdminClient } from '@supabase/supabase-js'
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
        const { figmaUrl, forceRefresh = false } = await request.json()

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

        const figmaCooldownKey = `${user.id}:${fileKey}`
        const activeCooldownSec = getFigmaCooldownSeconds(figmaCooldownKey)
        const hasMatchingCachedImport =
          !!campaign.project_id &&
          campaign.figma_url === figmaUrl

        let cachedFramesForFallback: Array<Record<string, unknown>> = []
        if (hasMatchingCachedImport) {
          const { data: cachedFrames } = await supabase
            .from('frames')
            .select('*')
            .eq('project_id', campaign.project_id!)
            .order('display_order', { ascending: true })

          if (cachedFrames && cachedFrames.length > 0) {
            cachedFramesForFallback = cachedFrames

            if (!forceRefresh) {
              send({ type: 'progress', message: 'Design previously imported. Setting up...' })

              if (activeCooldownSec > 0) {
                send({
                  type: 'warning',
                  code: 'using_cached_frames',
                  message: `Figma is temporarily rate-limited. Using your cached frames for now (retry in ~${activeCooldownSec}s).`,
                })
              }

              send({
                type: 'done',
                projectId: campaign.project_id,
                frameCount: cachedFrames.length,
                frames: cachedFrames,
                cached: true,
              })
              controller.close()
              return
            }
          }
        }

        // Check for existing import from any campaign (cross-campaign dedup)
        if (!forceRefresh) {
          const { data: existingProject } = await supabase
            .from('projects')
            .select('id, name, figma_url, slice_master_image_url, slice_layout_json')
            .eq('user_id', user.id)
            .eq('figma_file_key', fileKey)
            .eq('figma_node_id', nodeId)
            .eq('status', 'ready')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (existingProject && existingProject.id !== campaign.project_id) {
            const { data: existingFrames } = await supabase
              .from('frames')
              .select('*')
              .eq('project_id', existingProject.id)
              .order('display_order', { ascending: true })

            if (existingFrames && existingFrames.length > 0) {
              send({ type: 'progress', message: 'Design previously imported. Setting up...' })

              // Delete existing project/frames for this campaign
              if (campaign.project_id) {
                await deleteFrameImagesForProject(user.id, campaign.project_id)
                await supabase.from('frames').delete().eq('project_id', campaign.project_id)
                await supabase.from('projects').delete().eq('id', campaign.project_id)
              }

              // Create new project by cloning metadata
              const { data: newProject, error: cloneProjectError } = await supabase
                .from('projects')
                .insert({
                  user_id: user.id,
                  name: existingProject.name,
                  figma_url: figmaUrl,
                  figma_file_key: fileKey,
                  figma_node_id: nodeId,
                  klaviyo_connection_id: campaign.klaviyo_connection_id,
                  campaign_id: campaignId,
                  status: 'ready',
                  slice_master_image_url: existingProject.slice_master_image_url ?? null,
                  slice_layout_json: existingProject.slice_layout_json ?? null,
                })
                .select()
                .single()

              if (cloneProjectError || !newProject) {
                console.error('Clone project error:', cloneProjectError)
                // Fall through to normal import flow
              } else {
                // Copy storage image if in slice mode
                let clonedImageUrl = existingFrames[0].image_url
                if (existingFrames[0].image_url) {
                  const supabaseAdmin = createAdminClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                  )

                  const oldPath = `${user.id}/${existingProject.id}/full.png`
                  const newPath = `${user.id}/${newProject.id}/full.png`
                  const { error: copyError } = await supabaseAdmin.storage
                    .from('frame-images')
                    .copy(oldPath, newPath)

                  if (!copyError) {
                    const { data: publicUrlData } = supabaseAdmin.storage
                      .from('frame-images')
                      .getPublicUrl(newPath)
                    clonedImageUrl = publicUrlData.publicUrl
                  }
                  // If copy fails, keep referencing the existing URL
                }

                // Clone frame records
                const framesToInsert = existingFrames.map((frame, index) => ({
                  project_id: newProject.id,
                  figma_node_id: frame.figma_node_id,
                  name: frame.name,
                  width: frame.width,
                  image_url: index === 0 && clonedImageUrl ? clonedImageUrl : frame.image_url,
                  display_order: frame.display_order,
                }))

                const { error: cloneFramesError } = await supabase
                  .from('frames')
                  .insert(framesToInsert)

                if (!cloneFramesError) {
                  // Update campaign
                  await supabase
                    .from('campaigns')
                    .update({
                      project_id: newProject.id,
                      figma_url: figmaUrl,
                      name: campaign.name === 'Untitled Campaign' ? existingProject.name : campaign.name,
                      slice_mode: true,
                    })
                    .eq('id', campaignId)

                  const { data: frames } = await supabase
                    .from('frames')
                    .select('*')
                    .eq('project_id', newProject.id)
                    .order('display_order', { ascending: true })

                  send({
                    type: 'done',
                    projectId: newProject.id,
                    frameCount: framesToInsert.length,
                    frames: frames || [],
                    cloned: true,
                  })
                  controller.close()
                  return
                }

                // If frame clone failed, clean up and fall through
                await deleteFrameImagesForProject(user.id, newProject.id)
                await supabase.from('projects').delete().eq('id', newProject.id)
              }
            }
          }
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

        send({ type: 'progress', message: 'Fetching frame structure from Figma...' })
        // Fetch frame children from Figma
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
            if (cachedFramesForFallback.length > 0 && !forceRefresh) {
              send({
                type: 'warning',
                code: 'using_cached_frames',
                message: 'Figma is currently rate-limited. Using your previously imported frames.',
              })
              send({
                type: 'done',
                projectId: campaign.project_id,
                frameCount: cachedFramesForFallback.length,
                frames: cachedFramesForFallback,
                cached: true,
              })
              controller.close()
              return
            }
            send(buildRateLimitedPayload(err.details))
            controller.close()
            return
          }
          throw err
        }

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
        // Slice-only flow: export the parent frame as one image for the slicer
        const nodesToExport = [{
          id: nodeId,
          name: frameName,
          type: parentNode.document.type,
          width: Math.round(parentNode.document.absoluteBoundingBox?.width || 600),
        }]

        send({ type: 'progress', message: `Found ${nodesToExport.length} frame(s). Creating images...` })

        // Get image URLs, grouped by scale so each node targets 1080px export width.
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
              if (cachedFramesForFallback.length > 0 && !forceRefresh) {
                send({
                  type: 'warning',
                  code: 'using_cached_frames',
                  message: 'Figma is currently rate-limited. Using your previously imported frames.',
                })
                send({
                  type: 'done',
                  projectId: campaign.project_id,
                  frameCount: cachedFramesForFallback.length,
                  frames: cachedFramesForFallback,
                  cached: true,
                })
                controller.close()
                return
              }
              send(buildRateLimitedPayload(err.details))
              controller.close()
              return
            }
            throw err
          }

          if (!imagesResponse.ok) {
            const errorText = await imagesResponse.text()
            console.error('Figma images API error:', errorText)
            send({ type: 'error', message: 'Failed to get images from Figma' })
            controller.close()
            return
          }

          const imagesData = await imagesResponse.json()
          Object.assign(images, imagesData.images || {})
        }

        send({ type: 'progress', message: 'Saving to database...' })

        // Delete existing project and frames if campaign already has one
        if (campaign.project_id) {
          await deleteFrameImagesForProject(user.id, campaign.project_id)
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

        // Download from Figma and upload to Supabase Storage for CORS-safe canvas slicing
        const imageUrls: Record<string, string> = {}
        const supabaseAdmin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        for (const node of nodesToExport) {
          const figmaImageUrl = images[node.id]
          if (!figmaImageUrl) continue

          send({ type: 'progress', message: 'Uploading image to storage...' })

          const imageResponse = await fetch(figmaImageUrl)
          if (!imageResponse.ok) {
            send({ type: 'error', message: 'Failed to download image from Figma' })
            controller.close()
            return
          }

          const imageBlob = await imageResponse.arrayBuffer()
          const storagePath = `${user.id}/${project.id}/full.png`

          const { error: uploadError } = await supabaseAdmin.storage
            .from('frame-images')
            .upload(storagePath, imageBlob, {
              contentType: 'image/png',
              upsert: true,
            })

          if (uploadError) {
            console.error('Storage upload error:', uploadError)
            send({ type: 'error', message: 'Failed to upload image to storage' })
            controller.close()
            return
          }

          const { data: publicUrlData } = supabaseAdmin.storage
            .from('frame-images')
            .getPublicUrl(storagePath)

          imageUrls[node.id] = publicUrlData.publicUrl
        }

        // Create frames
        const framesToInsert = nodesToExport.map((node, index) => ({
          project_id: project.id,
          figma_node_id: node.id,
          name: node.name,
          width: node.width,
          image_url: imageUrls[node.id] || null,
          display_order: index,
        }))

        const { error: framesError } = await supabase
          .from('frames')
          .insert(framesToInsert)

        if (framesError) {
          console.error('Frames creation error:', framesError)
          await deleteFrameImagesForProject(user.id, project.id)
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
            slice_mode: true,
          })
          .eq('id', campaignId)

        if (nodesToExport[0]) {
          const masterUrl = imageUrls[nodesToExport[0].id] || null
          await supabase
            .from('projects')
            .update({
              slice_master_image_url: masterUrl,
              slice_layout_json: null,
            })
            .eq('id', project.id)
        }

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
