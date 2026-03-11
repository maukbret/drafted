import { KlaviyoAnalyticsData } from '@/types/database'
import { ReportInsights, parseGeminiInsightsText } from '@/lib/report-insights'

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'
const REQUEST_TIMEOUT_MS = 30_000

interface GenerateReportInsightsInput {
  reportTitle: string
  accountLabel: string
  periodLabel: string
  compareLabel: string
  includeListGrowth: boolean
  analytics: KlaviyoAnalyticsData
}

interface GenerateReportInsightsResult {
  insights: ReportInsights
  model: string
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
  error?: {
    message?: string
  }
}

function getGeminiConfig(): { apiKey: string; model: string } {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY. Add it to your environment before generating insights.')
  }

  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim()
  if (!model) {
    throw new Error('GEMINI_MODEL is empty.')
  }

  return { apiKey, model }
}

function compactAnalyticsPayload(data: KlaviyoAnalyticsData) {
  return {
    revenue: {
      totalRevenue: data.totalRevenue,
      compTotalRevenue: data.compTotalRevenue,
      attributedRevenue: data.attributedRevenue,
      compAttributedRevenue: data.compAttributedRevenue,
    },
    campaigns: data.campaigns.map((campaign) => ({
      name: campaign.name,
      revenue: campaign.revenue,
      openRate: campaign.openRate,
      clickRate: campaign.clickRate,
      deliveredCount: campaign.deliveredCount,
    })),
    campaignsComparison: data.compCampaigns.map((campaign) => ({
      name: campaign.name,
      revenue: campaign.revenue,
      openRate: campaign.openRate,
      clickRate: campaign.clickRate,
      deliveredCount: campaign.deliveredCount,
    })),
    flows: data.flows.map((flow) => ({
      name: flow.name,
      revenue: flow.revenue,
      openRate: flow.openRate,
      clickRate: flow.clickRate,
      deliveredCount: flow.deliveredCount,
    })),
    flowsComparison: data.compFlows.map((flow) => ({
      name: flow.name,
      revenue: flow.revenue,
      openRate: flow.openRate,
      clickRate: flow.clickRate,
      deliveredCount: flow.deliveredCount,
    })),
    listGrowth: {
      activeProfiles: data.activeProfiles ?? null,
      newSubscribers: data.newSubscribers ?? null,
      unsubscribers: data.unsubscribers ?? null,
      netGrowth: data.netGrowth ?? null,
      netGrowthPercent: data.netGrowthPercent ?? null,
    },
  }
}

function buildPrompt(input: GenerateReportInsightsInput): string {
  const compactPayload = compactAnalyticsPayload(input.analytics)

  return [
    'You are a lifecycle marketing analyst preparing a client-ready monthly performance report.',
    'Use ONLY the provided data and DO NOT invent numbers or entities.',
    'If information is missing or null, explicitly say that data is unavailable.',
    '',
    'Return ONLY valid JSON. No markdown, no code fences.',
    'Use this exact JSON schema:',
    '{',
    '  "overview": { "summary": "string", "highlights": ["string"], "actionItems": ["string"] },',
    '  "campaigns": { "summary": "string", "highlights": ["string"], "actionItems": ["string"] },',
    '  "flows": { "summary": "string", "highlights": ["string"], "actionItems": ["string"] },',
    '  "listGrowth": { "summary": "string", "highlights": ["string"], "actionItems": ["string"] }',
    '}',
    '',
    'Writing constraints:',
    '- summary: 1 short paragraph (max 90 words).',
    '- highlights: 2 to 4 concise bullets.',
    '- actionItems: 2 to 4 concrete, prioritized actions.',
    '- Prefer direct language suitable for client reports.',
    '',
    'Report context:',
    JSON.stringify({
      reportTitle: input.reportTitle,
      accountLabel: input.accountLabel,
      periodLabel: input.periodLabel,
      compareLabel: input.compareLabel,
      includeListGrowth: input.includeListGrowth,
      data: compactPayload,
    }),
  ].join('\n')
}

function extractGeminiText(response: GeminiGenerateContentResponse): string {
  const candidate = response.candidates?.[0]
  const text = candidate?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim()

  if (!text) {
    const finishReason = candidate?.finishReason
    throw new Error(
      `Gemini returned an empty response${finishReason ? ` (finish reason: ${finishReason})` : ''}.`
    )
  }

  return text
}

export async function generateReportInsights(
  input: GenerateReportInsightsInput
): Promise<GenerateReportInsightsResult> {
  const { apiKey, model } = getGeminiConfig()
  const prompt = buildPrompt(input)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1800,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    )

    let json: GeminiGenerateContentResponse = {}
    try {
      json = (await response.json()) as GeminiGenerateContentResponse
    } catch {
      json = {}
    }

    if (!response.ok) {
      const message = json.error?.message || `Gemini request failed with status ${response.status}.`
      throw new Error(message)
    }

    const text = extractGeminiText(json)
    const insights = parseGeminiInsightsText(text)

    return {
      insights,
      model,
    }
  } finally {
    clearTimeout(timeout)
  }
}
