export interface FrameUrlSource {
  image_url?: string | null
  klaviyo_image_url?: string | null
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Path segment for public objects in the Supabase `frame-images` bucket (embeds must not appear in Klaviyo template HTML). */
export const SUPABASE_FRAME_IMAGES_PUBLIC_PATH_INFIX = '/storage/v1/object/public/frame-images/'

/** True if full template HTML still references our Storage CDN (frame rows, footer, or regression). */
export function emailHtmlContainsSupabaseFrameImageUrls(html: string): boolean {
  return html.includes(SUPABASE_FRAME_IMAGES_PUBLIC_PATH_INFIX)
}

/** True if the URL is a public object in our Supabase `frame-images` bucket (not safe for recipient traffic at scale). */
export function isSupabaseFrameImagesPublicUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false
  try {
    return new URL(url).pathname.includes(SUPABASE_FRAME_IMAGES_PUBLIC_PATH_INFIX)
  } catch {
    return false
  }
}

export function getFrameDisplayUrl(frame: FrameUrlSource): string | null {
  return normalizeUrl(frame.klaviyo_image_url) || normalizeUrl(frame.image_url)
}
