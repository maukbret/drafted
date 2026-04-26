import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { EmailFrameRowInput } from '@/lib/email/frame-rows-html'
import { deleteFrameImageByUrl } from '@/lib/frame-images-server'
import { isPastFrameImageRetention } from '@/lib/frame-image-retention'
import { getFrameDisplayUrl, isSupabaseFrameImagesPublicUrl } from '@/lib/frame-url'
import { fetchWithKlaviyoRateLimitRetry } from '@/lib/klaviyo-rate-limited-fetch'

export type KlaviyoImportFrameRow = EmailFrameRowInput & { id: string; created_at?: string | null }

const KLAVIYO_IMAGES_API = 'https://a.klaviyo.com/api/images'
const KLAVIYO_REVISION = '2026-01-15'

export function formatKlaviyoImageApiErrorBody(errorBody: string): string {
  try {
    const parsed = JSON.parse(errorBody) as { errors?: Array<{ detail?: string; title?: string }> }
    const first = parsed.errors?.[0]
    if (first?.detail) return first.detail
    if (first?.title) return first.title
  } catch {
    /* ignore */
  }
  return errorBody.length > 400 ? `${errorBody.slice(0, 400)}…` : errorBody
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const normalized = url.trim()
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null
  return normalized
}

/**
 * Ensures every slice image is hosted by Klaviyo before building send/template HTML.
 * - If `image_url` is set, always POSTs `import_from_url` so Klaviyo fetches the current asset.
 * - Source Storage images are retained for a short edit window before we delete them.
 * - Fails the whole operation if Klaviyo does not return a hosted URL (no fallback to Supabase in email HTML).
 */
export async function importProjectFramesToKlaviyo<T extends KlaviyoImportFrameRow>(
  supabase: SupabaseClient,
  frames: T[],
  klaviyoToken: string,
  formatKlaviyoApiError: (errorBody: string) => string
): Promise<{ ok: true; frames: T[] } | { ok: false; message: string }> {
  /** POST /api/images is burst 3/s (Klaviyo); run imports one-at-a-time to stay under burst. */
  const results: Array<
    | { kind: 'empty' }
    | { kind: 'error'; message: string }
    | { kind: 'frame'; frame: T }
  > = []

  for (const frame of frames) {
    const sourceImageUrl = normalizeImageUrl(frame.image_url)
    const existingKlaviyoImageUrl = normalizeImageUrl(frame.klaviyo_image_url)

    if (!sourceImageUrl && !existingKlaviyoImageUrl) {
      results.push({ kind: 'empty' })
      continue
    }
    if (!sourceImageUrl && existingKlaviyoImageUrl) {
      results.push({
        kind: 'frame',
        frame: { ...frame, klaviyo_image_url: existingKlaviyoImageUrl } as T,
      })
      continue
    }

    try {
      const imageResponse = await fetchWithKlaviyoRateLimitRetry(
        KLAVIYO_IMAGES_API,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${klaviyoToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            revision: KLAVIYO_REVISION,
          },
          body: JSON.stringify({
            data: {
              type: 'image',
              attributes: {
                name: (frame.name ?? '').slice(0, 255) || 'Image',
                import_from_url: sourceImageUrl!,
                hidden: false,
              },
            },
          }),
        },
        { maxAttempts: 8, logLabel: `Klaviyo image import (${frame.name ?? 'slice'})` }
      )

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text()
        console.error('Klaviyo image import error:', frame.name, errorText)
        results.push({
          kind: 'error',
          message: `Klaviyo could not import image "${frame.name}": ${formatKlaviyoApiError(errorText)}`,
        })
        continue
      }

      const imageData = (await imageResponse.json()) as {
        data?: { attributes?: { image_url?: string } }
      }
      const klaviyoImageUrl = normalizeImageUrl(imageData.data?.attributes?.image_url)
      if (!klaviyoImageUrl) {
        results.push({
          kind: 'error',
          message: `Klaviyo did not return a hosted image URL for "${frame.name}". Try again.`,
        })
        continue
      }

      const canDeleteSourceImage = isPastFrameImageRetention(frame.created_at)
      const deletedSourceImage = canDeleteSourceImage
        ? await deleteFrameImageByUrl(sourceImageUrl)
        : false
      await supabase
        .from('frames')
        .update({
          image_url: deletedSourceImage ? null : frame.image_url,
          klaviyo_image_url: klaviyoImageUrl,
        })
        .eq('id', frame.id)

      results.push({
        kind: 'frame',
        frame: {
          ...frame,
          image_url: deletedSourceImage ? null : frame.image_url,
          klaviyo_image_url: klaviyoImageUrl,
        } as T,
      })
    } catch (err) {
      console.error('Klaviyo image import failed:', frame.name, err)
      results.push({
        kind: 'error',
        message: `Failed to import image "${frame.name}" to Klaviyo. Check your connection and try again.`,
      })
    }
  }

  const firstError = results.find((r): r is { kind: 'error'; message: string } => r.kind === 'error')
  if (firstError) return { ok: false, message: firstError.message }

  const uploadedFrames: T[] = []
  for (const r of results) {
    if (r.kind === 'frame') uploadedFrames.push(r.frame)
  }

  for (const frame of uploadedFrames) {
    const displayUrl = getFrameDisplayUrl(frame)
    if (displayUrl && isSupabaseFrameImagesPublicUrl(displayUrl)) {
      const name = frame.name || 'Section'
      return {
        ok: false,
        message: `Image "${name}" is still on app storage. Klaviyo must host all email images before export.`,
      }
    }
  }

  return { ok: true, frames: uploadedFrames }
}
