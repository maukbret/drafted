export type ReportAIStatus = 'idle' | 'generating' | 'ready' | 'failed'

export interface ReportInsightSection {
  summary: string
  highlights: string[]
  actionItems: string[]
}

export interface ReportInsights {
  overview: ReportInsightSection
  campaigns: ReportInsightSection
  flows: ReportInsightSection
  listGrowth: ReportInsightSection
}

const SECTION_KEYS: Array<keyof ReportInsights> = [
  'overview',
  'campaigns',
  'flows',
  'listGrowth',
]

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []

  const items: string[] = []
  for (const item of value) {
    const text = asTrimmedString(item)
    if (text) items.push(text)
    if (items.length >= maxItems) break
  }
  return items
}

function normalizeSection(
  value: unknown,
  fallbackSummary: string,
): ReportInsightSection {
  if (!value || typeof value !== 'object') {
    return {
      summary: fallbackSummary,
      highlights: [],
      actionItems: [],
    }
  }

  const record = value as Record<string, unknown>
  const summary = asTrimmedString(record.summary) || fallbackSummary
  const highlights = asStringList(record.highlights, 5)
  const actionItems = asStringList(record.actionItems, 5)

  return {
    summary,
    highlights,
    actionItems,
  }
}

export function normalizeReportInsights(value: unknown): ReportInsights | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>

  const normalized: Partial<ReportInsights> = {}
  for (const key of SECTION_KEYS) {
    normalized[key] = normalizeSection(record[key], 'No insight available yet.')
  }

  return normalized as ReportInsights
}

export function isReportAiStatus(value: unknown): value is ReportAIStatus {
  return value === 'idle' || value === 'generating' || value === 'ready' || value === 'failed'
}

export function parseGeminiInsightsText(text: string): ReportInsights {
  const trimmed = text.trim()
  const maybeFenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const jsonText = maybeFenced ? maybeFenced[1] : trimmed

  const parsed = JSON.parse(jsonText) as unknown
  const normalized = normalizeReportInsights(parsed)

  if (!normalized) {
    throw new Error('Gemini response did not match expected insights format.')
  }

  return normalized
}

export function isMissingReportInsightsColumnsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string | null; message?: string | null }
  if (maybeError.code !== 'PGRST204') return false

  const message = (maybeError.message || '').toLowerCase()
  return (
    message.includes('ai_status')
    || message.includes('ai_insights')
    || message.includes('ai_model')
    || message.includes('ai_generated_at')
    || message.includes('ai_error')
  )
}
