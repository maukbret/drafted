import { parseInsightsText } from '@/lib/report-insights'
import {
  GenerateReportInsightsInput,
  GenerateReportInsightsResult,
  REQUEST_TIMEOUT_MS,
  buildInsightsPrompt,
} from './types'

const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string
    text?: string
  }>
  model?: string
  stop_reason?: string | null
  error?: {
    message?: string
  }
}

function getAnthropicConfig(): { apiKey: string; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY. Add it to your environment before generating insights.')
  }

  const model = (process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL).trim()
  if (!model) {
    throw new Error('ANTHROPIC_MODEL is empty.')
  }

  return { apiKey, model }
}

function extractAnthropicText(response: AnthropicMessagesResponse): string {
  const text = response.content
    ?.filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('')
    .trim()

  if (!text) {
    const stopReason = response.stop_reason
    throw new Error(
      `Anthropic returned an empty response${stopReason ? ` (stop reason: ${stopReason})` : ''}.`
    )
  }

  return text
}

function normalizeAnthropicErrorMessage(message: string): string {
  const trimmed = message.trim()
  if (trimmed.toLowerCase().startsWith('model:')) {
    return [
      `Unsupported or unavailable Anthropic model (${trimmed}).`,
      'Set ANTHROPIC_MODEL to a currently supported model, e.g. claude-sonnet-4-20250514.',
    ].join(' ')
  }
  return trimmed
}

export async function generateReportInsights(
  input: GenerateReportInsightsInput
): Promise<GenerateReportInsightsResult> {
  const { apiKey, model } = getAnthropicConfig()
  const prompt = buildInsightsPrompt(input)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${ANTHROPIC_API_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 2800,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })

    let json: AnthropicMessagesResponse = {}
    try {
      json = (await response.json()) as AnthropicMessagesResponse
    } catch {
      json = {}
    }

    if (!response.ok) {
      const rawMessage = json.error?.message || `Anthropic request failed with status ${response.status}.`
      throw new Error(normalizeAnthropicErrorMessage(rawMessage))
    }

    const text = extractAnthropicText(json)
    const insights = parseInsightsText(text)

    return {
      insights,
      model: (json.model || model).trim(),
    }
  } finally {
    clearTimeout(timeout)
  }
}
