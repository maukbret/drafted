import type { GenerateReportInsightsInput, GenerateReportInsightsResult } from './types'

export type { GenerateReportInsightsInput, GenerateReportInsightsResult }

type AIProvider = 'gemini' | 'anthropic'

function getProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase()
  if (provider === 'anthropic') return 'anthropic'
  return 'gemini'
}

export async function generateReportInsights(
  input: GenerateReportInsightsInput
): Promise<GenerateReportInsightsResult> {
  const provider = getProvider()

  if (provider === 'anthropic') {
    const { generateReportInsights: anthropic } = await import('./anthropic')
    return anthropic(input)
  }

  const { generateReportInsights: gemini } = await import('./gemini')
  return gemini(input)
}
