export const FRAME_IMAGE_SOURCE_RETENTION_HOURS = 12

export function getFrameImageRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - FRAME_IMAGE_SOURCE_RETENTION_HOURS * 60 * 60 * 1000)
}

export function isPastFrameImageRetention(createdAt: string | null | undefined, now = new Date()): boolean {
  if (typeof createdAt !== 'string') return false

  const createdAtTime = Date.parse(createdAt)
  if (!Number.isFinite(createdAtTime)) return false

  return now.getTime() - createdAtTime >= FRAME_IMAGE_SOURCE_RETENTION_HOURS * 60 * 60 * 1000
}
