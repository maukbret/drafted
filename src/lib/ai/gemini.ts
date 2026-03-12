import { parseInsightsText } from '@/lib/report-insights'
import {
  GenerateReportInsightsInput,
  GenerateReportInsightsResult,
  REQUEST_TIMEOUT_MS,
  buildInsightsPrompt,
} from './types'

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

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
  const prompt = buildInsightsPrompt(input)

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
            maxOutputTokens: 8192,
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
    const insights = parseInsightsText(text)

    return {
      insights,
      model,
    }
  } finally {
    clearTimeout(timeout)
  }
}
