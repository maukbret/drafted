export interface GenerateEmailCopyInput {
  campaignName?: string | null
  frameName?: string | null
  textSnippets: string[]
}

export interface GenerateEmailCopyResult {
  subjectLine: string
  previewText: string
  model: string
}

const MAX_PROMPT_SNIPPETS = 120
const MAX_PROMPT_CHARS = 8_000

function compactTextSnippets(textSnippets: string[]): string[] {
  const compact: string[] = []
  let totalChars = 0

  for (const snippet of textSnippets) {
    const normalized = snippet.replace(/\s+/g, ' ').trim()
    if (!normalized) continue

    if (compact.length >= MAX_PROMPT_SNIPPETS) break
    if (totalChars + normalized.length > MAX_PROMPT_CHARS) break

    compact.push(normalized)
    totalChars += normalized.length
  }

  return compact
}

export function buildEmailCopyPrompt(input: GenerateEmailCopyInput): string {
  const textSnippets = compactTextSnippets(input.textSnippets)

  return [
    'You write ecommerce marketing email subject lines and preview text.',
    '',
    'Based on the extracted copy from a single Figma email frame, generate:',
    '1. One subject line',
    '2. One preview text',
    '',
    'Return ONLY valid JSON. No markdown, no code fences.',
    'Use this exact shape:',
    '{',
    '  "subjectLine": "string",',
    '  "previewText": "string"',
    '}',
    '',
    'Rules:',
    '- Subject line must be clear, concise, and grounded in the provided copy.',
    '- Subject line should usually stay under 60 characters.',
    '- Preview text should complement the subject line, not repeat it.',
    '- Preview text should usually stay under 90 characters.',
    '- Do not invent offers, percentages, products, dates, or claims not supported by the provided text.',
    '- Do not use emojis or all caps.',
    '- In subjectLine and previewText only: avoid smart quotes and do not wrap the line in extra quote characters.',
    '- Keep the writing natural and campaign-ready.',
    '',
    'Context:',
    JSON.stringify({
      campaignName: input.campaignName?.trim() || null,
      frameName: input.frameName?.trim() || null,
      textSnippets,
    }),
  ].join('\n')
}

function sliceFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\' && inString) {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function readJsonObjectStringField(raw: string, key: string): string | null {
  const needle = `"${key}"`
  let pos = raw.indexOf(needle)
  if (pos === -1) return null

  pos = raw.indexOf(':', pos + needle.length)
  if (pos === -1) return null

  pos++
  while (pos < raw.length && /\s/.test(raw[pos])) pos++

  if (raw[pos] !== '"') return null
  pos++

  let out = ''
  while (pos < raw.length) {
    const c = raw[pos]
    if (c === '\\') {
      if (pos + 1 >= raw.length) return null
      const n = raw[pos + 1]
      switch (n) {
        case 'n':
          out += '\n'
          pos += 2
          continue
        case 'r':
          out += '\r'
          pos += 2
          continue
        case 't':
          out += '\t'
          pos += 2
          continue
        case '"':
        case '\\':
        case '/':
          out += n
          pos += 2
          continue
        case 'u': {
          const hex = raw.slice(pos + 2, pos + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null
          out += String.fromCharCode(Number.parseInt(hex, 16))
          pos += 6
          continue
        }
        default:
          out += n
          pos += 2
          continue
      }
    }
    if (c === '"') {
      return out
    }
    out += c
    pos++
  }

  return null
}

export function parseEmailCopyResponse(text: string): Omit<GenerateEmailCopyResult, 'model'> {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  const maybeFenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  let jsonText = (maybeFenced ? maybeFenced[1] : trimmed).trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    const sliced = sliceFirstJsonObject(jsonText) ?? sliceFirstJsonObject(trimmed)
    if (sliced) {
      try {
        parsed = JSON.parse(sliced)
      } catch {
        parsed = undefined
      }
    }
  }

  if (parsed === undefined) {
    const subjectLine = readJsonObjectStringField(trimmed, 'subjectLine')
    const previewText = readJsonObjectStringField(trimmed, 'previewText')
    const s = subjectLine?.trim() ?? ''
    const p = previewText?.trim() ?? ''
    if (s && p) {
      return { subjectLine: s, previewText: p }
    }
    throw new Error('AI response was not valid JSON.')
  }

  for (let i = 0; i < 8; i++) {
    if (typeof parsed !== 'string') break
    const inner = parsed.trim()
    if (!inner) break
    try {
      parsed = JSON.parse(inner)
    } catch {
      break
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response did not match the expected format.')
  }

  const subjectLine = typeof (parsed as { subjectLine?: unknown }).subjectLine === 'string'
    ? (parsed as { subjectLine: string }).subjectLine.trim()
    : ''
  const previewText = typeof (parsed as { previewText?: unknown }).previewText === 'string'
    ? (parsed as { previewText: string }).previewText.trim()
    : ''

  if (!subjectLine) {
    throw new Error('AI response did not include a subject line.')
  }

  if (!previewText) {
    throw new Error('AI response did not include preview text.')
  }

  return {
    subjectLine,
    previewText,
  }
}
