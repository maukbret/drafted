import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

const FRAME_IMAGES_BUCKET = 'frame-images'
const PUBLIC_BUCKET_SEGMENT = `/storage/v1/object/public/${FRAME_IMAGES_BUCKET}/`

export function extractFrameImageStoragePath(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsedUrl = new URL(url)
    const markerIndex = parsedUrl.pathname.indexOf(PUBLIC_BUCKET_SEGMENT)
    if (markerIndex === -1) return null

    const rawPath = parsedUrl.pathname.slice(markerIndex + PUBLIC_BUCKET_SEGMENT.length)
    const decodedPath = decodeURIComponent(rawPath)
    return decodedPath.length > 0 ? decodedPath : null
  } catch {
    return null
  }
}

export async function deleteFrameImageByUrl(url: string | null | undefined): Promise<boolean> {
  const storagePath = extractFrameImageStoragePath(url)
  if (!storagePath) return false

  const supabase = createServiceClient()
  const { error } = await supabase.storage
    .from(FRAME_IMAGES_BUCKET)
    .remove([storagePath])

  if (error) {
    console.error('Failed to delete frame image from storage:', storagePath, error)
    return false
  }

  return true
}

export async function deleteFrameImagesForProject(userId: string, projectId: string): Promise<number> {
  const supabase = createServiceClient()
  const folderPath = `${userId}/${projectId}`

  const { data: files, error: listError } = await supabase.storage
    .from(FRAME_IMAGES_BUCKET)
    .list(folderPath, { limit: 1000 })

  if (listError) {
    console.error('Failed to list frame images for cleanup:', folderPath, listError)
    return 0
  }

  if (!files || files.length === 0) {
    return 0
  }

  const filePaths = files.map(file => `${folderPath}/${file.name}`)
  const { error: removeError } = await supabase.storage
    .from(FRAME_IMAGES_BUCKET)
    .remove(filePaths)

  if (removeError) {
    console.error('Failed to remove frame images for project cleanup:', folderPath, removeError)
    return 0
  }

  return filePaths.length
}

export async function deleteFrameImagesForProjectExceptUrls(
  userId: string,
  projectId: string,
  keepUrls: Array<string | null | undefined>
): Promise<number> {
  const supabase = createServiceClient()
  const folderPath = `${userId}/${projectId}`

  const { data: files, error: listError } = await supabase.storage
    .from(FRAME_IMAGES_BUCKET)
    .list(folderPath, { limit: 1000 })

  if (listError) {
    console.error('Failed to list frame images for selective cleanup:', folderPath, listError)
    return 0
  }

  if (!files || files.length === 0) {
    return 0
  }

  const keepPaths = new Set(
    keepUrls
      .map(url => extractFrameImageStoragePath(url))
      .filter((path): path is string => Boolean(path))
  )

  const filePathsToRemove = files
    .map(file => `${folderPath}/${file.name}`)
    .filter(path => !keepPaths.has(path))

  if (filePathsToRemove.length === 0) {
    return 0
  }

  const { error: removeError } = await supabase.storage
    .from(FRAME_IMAGES_BUCKET)
    .remove(filePathsToRemove)

  if (removeError) {
    console.error('Failed to remove stale frame images for project cleanup:', folderPath, removeError)
    return 0
  }

  return filePathsToRemove.length
}
