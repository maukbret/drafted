import { deleteFrameImageByUrl } from '@/lib/frame-images-server'
import {
  FRAME_IMAGE_SOURCE_RETENTION_HOURS,
  getFrameImageRetentionCutoff,
} from '@/lib/frame-image-retention'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

const MAX_FRAMES_PER_RUN = 500
const MAX_PROJECT_MASTER_IMAGES_PER_RUN = 500

type FrameCleanupCandidate = {
  id: string
  image_url: string | null
}

type ProjectMasterCleanupCandidate = {
  id: string
  slice_master_image_url: string | null
}

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured for frame cleanup cron route')
    return false
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const cutoffIso = getFrameImageRetentionCutoff().toISOString()

    const { data: candidates, error: candidatesError } = await supabase
      .from('frames')
      .select('id, image_url')
      .not('image_url', 'is', null)
      .not('klaviyo_image_url', 'is', null)
      .lt('created_at', cutoffIso)
      .limit(MAX_FRAMES_PER_RUN)

    if (candidatesError) {
      console.error('Failed to fetch frame cleanup candidates:', candidatesError)
      return NextResponse.json({ error: 'Failed to fetch cleanup candidates' }, { status: 500 })
    }

    const framesToCleanup = (candidates || []).filter(
      (frame): frame is FrameCleanupCandidate =>
        typeof frame.image_url === 'string' && frame.image_url.length > 0
    )

    const { data: projectCandidates, error: projectCandidatesError } = await supabase
      .from('projects')
      .select('id, slice_master_image_url')
      .not('slice_master_image_url', 'is', null)
      .lt('updated_at', cutoffIso)
      .limit(MAX_PROJECT_MASTER_IMAGES_PER_RUN)

    if (projectCandidatesError) {
      console.error('Failed to fetch project master image cleanup candidates:', projectCandidatesError)
      return NextResponse.json({ error: 'Failed to fetch project master cleanup candidates' }, { status: 500 })
    }

    const projectMastersToCleanup = (projectCandidates || []).filter(
      (project): project is ProjectMasterCleanupCandidate =>
        typeof project.slice_master_image_url === 'string' && project.slice_master_image_url.length > 0
    )

    const frameCleanupResults = await Promise.all(
      framesToCleanup.map(async (frame) => {
        const deleted = await deleteFrameImageByUrl(frame.image_url)
        return { id: frame.id, deleted }
      })
    )

    const projectMasterCleanupResults = await Promise.all(
      projectMastersToCleanup.map(async (project) => {
        const deleted = await deleteFrameImageByUrl(project.slice_master_image_url)
        return { id: project.id, deleted }
      })
    )

    const deletedFrameIds = frameCleanupResults.filter((result) => result.deleted).map((result) => result.id)
    const deletedProjectMasterIds = projectMasterCleanupResults
      .filter((result) => result.deleted)
      .map((result) => result.id)

    if (deletedFrameIds.length > 0) {
      const { error: updateError } = await supabase
        .from('frames')
        .update({ image_url: null })
        .in('id', deletedFrameIds)

      if (updateError) {
        console.error('Failed to null frame image URLs after cleanup:', updateError)
        return NextResponse.json({ error: 'Failed to persist cleanup updates' }, { status: 500 })
      }
    }

    if (deletedProjectMasterIds.length > 0) {
      const { error: updateError } = await supabase
        .from('projects')
        .update({ slice_master_image_url: null })
        .in('id', deletedProjectMasterIds)

      if (updateError) {
        console.error('Failed to null project master image URLs after cleanup:', updateError)
        return NextResponse.json({ error: 'Failed to persist project master cleanup updates' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      retentionHours: FRAME_IMAGE_SOURCE_RETENTION_HOURS,
      checked: framesToCleanup.length,
      deleted: deletedFrameIds.length,
      updated: deletedFrameIds.length,
      failed: framesToCleanup.length - deletedFrameIds.length,
      maxFramesPerRun: MAX_FRAMES_PER_RUN,
      projectMasters: {
        checked: projectMastersToCleanup.length,
        deleted: deletedProjectMasterIds.length,
        updated: deletedProjectMasterIds.length,
        failed: projectMastersToCleanup.length - deletedProjectMasterIds.length,
        maxProjectsPerRun: MAX_PROJECT_MASTER_IMAGES_PER_RUN,
      },
      message:
        framesToCleanup.length === 0 && projectMastersToCleanup.length === 0
          ? 'No stale frame images to clean up'
          : undefined,
    })
  } catch (error) {
    console.error('Frame image cleanup cron failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
