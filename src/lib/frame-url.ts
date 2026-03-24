export interface FrameUrlSource {
  image_url?: string | null
  klaviyo_image_url?: string | null
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getFrameDisplayUrl(frame: FrameUrlSource): string | null {
  return normalizeUrl(frame.klaviyo_image_url) || normalizeUrl(frame.image_url)
}
