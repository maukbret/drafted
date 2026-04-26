import { scopeCssUnderSelector, scaleCssWidths } from './footer-css'

const TARGET_EMAIL_WIDTH = 600

/**
 * Klaviyo template-render can leave `href="[unsubscribe_tag]"` in compiled HTML.
 * In CODE templates Klaviyo expects `{% unsubscribe_link %}` (or `{% unsubscribe %}`) so
 * sends resolve correctly and compliance detection does not append a second footer.
 */
export function normalizeKlaviyoFooterPlaceholders(html: string): string {
  if (!html) return html
  return html.replace(/\[unsubscribe_tag\]/gi, '{% unsubscribe_link %}')
}

function extractWidthFromTag(tag: string): number | null {
  const widthAttrMatch = tag.match(/\swidth\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?(?=\s|>|\/)/i)
  if (widthAttrMatch) {
    return Number(widthAttrMatch[1])
  }

  const styleWidthMatch = tag.match(/\b(?:max-width|width)\s*:\s*(\d+(?:\.\d+)?)px/i)
  if (styleWidthMatch) {
    return Number(styleWidthMatch[1])
  }

  return null
}

function detectFooterBaseWidth(html: string): number {
  const firstTableMatch = html.match(/<table\b[^>]*>/i)
  if (firstTableMatch) {
    const width = extractWidthFromTag(firstTableMatch[0])
    if (width && width > 0) {
      return width
    }
  }

  const widthCandidates: number[] = []
  const widthAttrRegex = /(?:\s|<)width\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?(?=\s|>|\/)/gi
  const styleWidthRegex = /\b(?:max-width|width)\s*:\s*(\d+(?:\.\d+)?)px/gi

  for (const match of html.matchAll(widthAttrRegex)) {
    widthCandidates.push(Number(match[1]))
  }

  for (const match of html.matchAll(styleWidthRegex)) {
    widthCandidates.push(Number(match[1]))
  }

  const validCandidates = widthCandidates.filter((value) => Number.isFinite(value) && value >= 200)
  if (validCandidates.length === 0) {
    return TARGET_EMAIL_WIDTH
  }

  return Math.max(...validCandidates)
}

function scaleDimensionValue(value: string, scale: number): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return value
  }

  const scaled = Math.max(1, Math.round(numeric * scale))
  return String(scaled)
}

// Clean up common HTML issues in footer that can break email rendering.
// Klaviyo footers often use Ghost Table MSO conditionals with invalid nesting.
function cleanFooterHtml(html: string): string {
  if (!html) return ''

  let cleaned = html

  cleaned = cleaned.replace(/<!--\[if mso\]><\/table><\/table><!\[endif\]-->/gi, '<!--[if mso]></table><![endif]-->')
  cleaned = cleaned.replace(/(<!--\[if mso\]>)(<\/table>)\2+(<!\[endif\]-->)/gi, '$1$2$3')
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<table[^>]*>\s*<tr>\s*<!\[endif\]-->/gi, '')
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<td[^>]*>\s*<!\[endif\]-->/gi, '')
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<\/td>\s*<!\[endif\]-->/gi, '')
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<\/tr>\s*<\/table>\s*<!\[endif\]-->/gi, '')
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n')

  return cleaned
}

export function normalizeFooterHtmlForExport(html: string, targetWidth = TARGET_EMAIL_WIDTH): string {
  const cleanedFooter = cleanFooterHtml(normalizeKlaviyoFooterPlaceholders(html))
  if (!cleanedFooter) return ''

  const baseWidth = detectFooterBaseWidth(cleanedFooter)
  if (!baseWidth || baseWidth <= 0 || baseWidth === targetWidth) {
    return cleanedFooter
  }

  const scale = targetWidth / baseWidth
  let normalized = cleanedFooter

  normalized = normalized.replace(
    /((?:\s|<)width\s*=\s*["']?)(\d+(?:\.\d+)?)(?:px)?(["']?)(?=\s|>|\/)/gi,
    (_, prefix: string, value: string, suffix: string) => `${prefix}${scaleDimensionValue(value, scale)}${suffix}`
  )

  normalized = normalized.replace(
    /(\b(?:width|max-width|min-width)\s*:\s*)(\d+(?:\.\d+)?)px/gi,
    (_, prefix: string, value: string) => `${prefix}${scaleDimensionValue(value, scale)}px`
  )

  return normalized
}

export function normalizeFooterCssForExport(
  css: string,
  footerBaseWidth?: number,
  targetWidth = TARGET_EMAIL_WIDTH
): string {
  if (!css) return ''

  const baseWidth = footerBaseWidth ?? targetWidth
  const scale = baseWidth > 0 && baseWidth !== targetWidth ? targetWidth / baseWidth : 1

  let normalized = css
  if (scale !== 1) {
    normalized = scaleCssWidths(normalized, scale)
  }

  normalized = scopeCssUnderSelector(normalized)

  return normalized
}
