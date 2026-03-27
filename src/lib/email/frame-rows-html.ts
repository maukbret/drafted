import { getFrameDisplayUrl } from '@/lib/frame-url'

/** Full-width email content area */
export const EMAIL_LAYOUT_FULL_WIDTH = 600
/** Stored `frames.width` for each cell in a 2-column row */
export const EMAIL_LAYOUT_TWO_COL_CELL_WIDTH = 300
/** Stored `frames.width` for each cell in a 3-column row */
export const EMAIL_LAYOUT_THREE_COL_CELL_WIDTH = 200

export type EmailFrameRowInput = {
  name: string
  width: number | null
  image_url?: string | null
  klaviyo_image_url?: string | null
  link_url: string | null
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const normalized = url.trim()
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null
  return normalized
}

/** Narrow cells from 3-column slice mode (stored width 200px). */
export function isThreeColumnFrameWidth(width: number | null | undefined): boolean {
  return (width ?? EMAIL_LAYOUT_FULL_WIDTH) < 250
}

/** Half-width cells from 2-column slice mode (stored width 300px). */
export function isTwoColumnFrameWidth(width: number | null | undefined): boolean {
  const w = width ?? EMAIL_LAYOUT_FULL_WIDTH
  return w >= 250 && w <= 350
}

function wrapLinkedImage(
  linkUrl: string | null,
  imgTag: string
): string {
  return linkUrl
    ? `<a href="${linkUrl}" target="_blank" style="display: block; text-decoration: none;">${imgTag}</a>`
    : imgTag
}

/**
 * Builds `<tr>...</tr>` rows for frame images (full-width, 2-up, or 3-up tables).
 * Must check 3-column groups before 2-column so 200px cells are not paired as a 2-col row.
 */
export function buildEmailFrameRowsHtml(frames: EmailFrameRowInput[]): string {
  const rows: string[] = []
  let i = 0

  while (i < frames.length) {
    const current = frames[i]
    const currentImageUrl = normalizeImageUrl(getFrameDisplayUrl(current))
    if (!currentImageUrl) {
      i += 1
      continue
    }

    const next = frames[i + 1]
    const next2 = frames[i + 2]
    const nextImageUrl = next ? normalizeImageUrl(getFrameDisplayUrl(next)) : null
    const next2ImageUrl = next2 ? normalizeImageUrl(getFrameDisplayUrl(next2)) : null

    const c3 =
      isThreeColumnFrameWidth(current.width) &&
      !!next &&
      !!next2 &&
      !!nextImageUrl &&
      !!next2ImageUrl &&
      isThreeColumnFrameWidth(next.width) &&
      isThreeColumnFrameWidth(next2.width)

    if (c3) {
      const wAttr = EMAIL_LAYOUT_THREE_COL_CELL_WIDTH
      const cells = [current, next!, next2!].map((frame, idx) => {
        const url = [currentImageUrl, nextImageUrl!, next2ImageUrl!][idx]
        const img = `<img src="${url}" alt="${frame.name}" width="${wAttr}" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`
        const inner = wrapLinkedImage(frame.link_url, img)
        return `              <td width="${wAttr}" valign="top" style="width: 33.33%;">
                ${inner}
              </td>`
      })

      rows.push(`      <tr>
        <td align="center" valign="top" style="padding: 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="width: 100%; max-width: 600px;">
            <tr>
${cells.join('\n')}
            </tr>
          </table>
        </td>
      </tr>`)
      i += 3
      continue
    }

    const c2 =
      isTwoColumnFrameWidth(current.width) &&
      !!next &&
      !!nextImageUrl &&
      isTwoColumnFrameWidth(next.width)

    if (c2) {
      const leftImg = `<img src="${currentImageUrl}" alt="${current.name}" width="300" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`
      const rightImg = `<img src="${nextImageUrl}" alt="${next!.name}" width="300" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`

      rows.push(`      <tr>
        <td align="center" valign="top" style="padding: 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="width: 100%; max-width: 600px;">
            <tr>
              <td width="300" valign="top" style="width: 50%;">
                ${wrapLinkedImage(current.link_url, leftImg)}
              </td>
              <td width="300" valign="top" style="width: 50%;">
                ${wrapLinkedImage(next!.link_url, rightImg)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
      i += 2
      continue
    }

    const imgTag = `<img src="${currentImageUrl}" alt="${current.name}" width="600" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`
    rows.push(`      <tr>
        <td align="center" valign="top" style="padding: 0;">
          ${wrapLinkedImage(current.link_url, imgTag)}
        </td>
      </tr>`)
    i += 1
  }

  return rows.join('\n')
}
