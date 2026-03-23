const SCOPE_SELECTOR = '.email-footer'

/**
 * Prefix every CSS selector with a scope selector so that preserved
 * Klaviyo styles don't leak into the rest of the email (e.g. frames,
 * product feed). Handles both top-level rules and rules inside @media blocks.
 */
export function scopeCssUnderSelector(css: string, scope = SCOPE_SELECTOR): string {
  if (!css) return ''

  // Split into @media blocks and top-level rule blocks
  // We process each chunk independently
  return css.replace(
    /(@media[^{]*\{)([\s\S]*?)(\n\s*\})/g,
    (_, mediaOpen: string, mediaBody: string, mediaClose: string) => {
      const scopedBody = scopeRuleBlock(mediaBody, scope)
      return `${mediaOpen}${scopedBody}${mediaClose}`
    }
  ).replace(
    // Scope top-level rules (not inside @media). We match selectors
    // followed by { ... }. Skip @media rules (already handled above)
    // and @-rules like @font-face.
    /(?<=\}|^)\s*(?!@)([\s\S]*?\{[\s\S]*?\})/g,
    (ruleBlock) => scopeRuleBlock(ruleBlock, scope)
  )
}

function scopeRuleBlock(block: string, scope: string): string {
  // Match each rule: selector(s) { declarations }
  return block.replace(
    /([^{}]+)(\{[^{}]*\})/g,
    (_, selectors: string, declarations: string) => {
      const scopedSelectors = selectors
        .split(',')
        .map((s) => {
          const trimmed = s.trim()
          if (!trimmed) return s
          return `${scope} ${trimmed}`
        })
        .join(',')
      return `${scopedSelectors}${declarations}`
    }
  )
}

/**
 * Scale width/max-width/min-width pixel values inside CSS rule bodies.
 * Does NOT scale @media breakpoint conditions — only property values.
 */
export function scaleCssWidths(css: string, scale: number): string {
  if (!css || scale === 1) return css

  let result = ''
  let i = 0

  while (i < css.length) {
    // Check if we're at an @media rule
    if (css.substring(i, i + 6) === '@media') {
      // Find the opening { of the @media condition
      const condEnd = css.indexOf('{', i)
      if (condEnd === -1) break

      // Copy the @media condition as-is (don't scale breakpoint values)
      result += css.substring(i, condEnd + 1)
      i = condEnd + 1

      // Now scale the rule bodies inside the @media block
      // Find the matching closing }
      let depth = 1
      let bodyStart = i
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++
        if (css[i] === '}') depth--
        i++
      }
      // i now points past the closing } of @media
      // The body is everything between bodyStart and i-1 (the closing })
      const body = css.substring(bodyStart, i - 1)
      result += scaleWidthValues(body) + '}'
    } else {
      // Not inside @media — find the next @media or end
      const nextMedia = css.indexOf('@media', i)
      const chunk = nextMedia === -1 ? css.substring(i) : css.substring(i, nextMedia)
      result += scaleWidthValues(chunk)
      i = nextMedia === -1 ? css.length : nextMedia
    }
  }

  return result

  function scaleWidthValues(text: string): string {
    return text.replace(
      /(\b(?:width|max-width|min-width)\s*:\s*)(\d+(?:\.\d+)?)px/gi,
      (_, prefix: string, value: string) => {
        const numeric = Number(value)
        if (!Number.isFinite(numeric) || numeric <= 0) return `${prefix}${value}px`
        const scaled = Math.max(1, Math.round(numeric * scale))
        return `${prefix}${scaled}px`
      }
    )
  }
}
