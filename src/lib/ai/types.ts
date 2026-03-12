import { KlaviyoAnalyticsData } from '@/types/database'
import { ReportInsights } from '@/lib/report-insights'

export interface GenerateReportInsightsInput {
  reportTitle: string
  accountLabel: string
  periodLabel: string
  compareLabel: string
  periodStart: string
  periodEnd: string
  compareStart: string
  compareEnd: string
  includeListGrowth: boolean
  language: string
  analytics: KlaviyoAnalyticsData
}

export interface GenerateReportInsightsResult {
  insights: ReportInsights
  model: string
}

export const REQUEST_TIMEOUT_MS = 60_000

export function compactAnalyticsPayload(data: KlaviyoAnalyticsData) {
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

export function buildInsightsPrompt(input: GenerateReportInsightsInput): string {
  const compactPayload = compactAnalyticsPayload(input.analytics)

  return [
    'You are a senior Klaviyo retention marketing specialist with deep expertise in e-commerce lifecycle marketing, email/SMS strategy, and customer retention. You have extensive knowledge of seasonal e-commerce patterns, promotional calendars, and how external factors influence email marketing performance.',
    '',
    'Your job is to produce a client-ready performance report that goes beyond surface-level metrics. You must:',
    '1. Explain WHY metrics changed — not just describe what changed.',
    '2. Cross-reference ALL available data across sections: revenue shifts should be tied to campaign volume, send frequency, open/click rate changes, flow performance, and list size trends.',
    '3. Factor in seasonality and the e-commerce calendar. The reporting period and comparison period dates are provided — use them to reason about seasonal context:',
    '   - Q4 (Oct–Dec) includes Black Friday, Cyber Monday, and holiday gifting — naturally the strongest revenue months for most e-commerce brands.',
    '   - January and February are typically slow months with post-holiday fatigue, reduced consumer spending, and higher unsubscribe rates.',
    '   - Q2 (Apr–Jun) often sees a spring uptick, with Mother\'s Day, Father\'s Day, and summer prep.',
    '   - Q3 (Jul–Sep) can be mixed: summer slumps for some verticals, back-to-school for others.',
    '   - If the reporting period is a historically slow month being compared to a peak month (or vice versa), explicitly acknowledge this context. But do NOT use seasonality as a blanket excuse — if performance dropped during a typically strong month, that is a red flag worth calling out. Similarly, strong performance during a slow period is noteworthy and should be highlighted positively.',
    '',
    'Use ONLY the provided data. DO NOT invent numbers, campaign names, or entities that are not in the data.',
    'If information is missing or null, say so explicitly.',
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
    '- summary: 1 short paragraph (max 90 words). Include seasonal context where relevant.',
    '- highlights: 2 to 4 concise bullets.',
    '- actionItems: EXACTLY 4 action items per section. Prioritize from highest to lowest impact.',
    '  CRITICAL rules for action items:',
    '  1. Every action item MUST include a data-backed hypothesis explaining WHY the trend occurred. Cross-reference ALL available data across sections.',
    '     Example: "Attributed revenue dropped 30% — likely driven by sending 20% fewer campaigns (8 vs 10) while the list contracted by 15%. Consider increasing send frequency to match the prior period."',
    '  2. Never write a generic action item like "investigate why revenue declined." Always provide the most likely explanation using the data, even if it is a hypothesis.',
    '  3. Action items are NOT only about fixing problems. They should also include GROWTH OPPORTUNITIES:',
    '     - A flow performing exceptionally well? Recommend expanding it (e.g., adding more touchpoints, a/b testing subject lines, extending the sequence).',
    '     - A campaign with standout open rates? Suggest replicating that format or segmentation approach.',
    '     - Strong list growth? Suggest leveraging the new subscribers with a dedicated welcome or re-engagement series.',
    '  4. Structure each action item as: observation (with numbers) → probable cause or context → specific recommendation.',
    '  5. Where relevant, acknowledge seasonal factors: compare the reporting period to what is typical for that time of year in e-commerce. If performance declined but the comparison was against a peak season (e.g., Black Friday), note that the decline may be partially seasonal while still identifying actionable improvements.',
    '- Prefer direct, confident language suitable for client-facing reports. Write as a specialist advising the brand, not as a generic analyst.',
    '',
    'Formatting rules:',
    '- NEVER use em dashes (\u2014) or en dashes (\u2013) anywhere in the output. Use hyphens (-), commas, or semicolons instead. This is a strict requirement.',
    `- All monetary values MUST be formatted in euros using European formatting: \u20AC1.234,56 (euro sign prefix, period as thousands separator, comma as decimal separator). Do NOT use dollar signs or US-style formatting.`,
    `- Write ALL text in ${input.language === 'nl' ? 'Dutch (Nederlands)' : 'American English'}. Every summary, highlight, and action item must be in this language.`,
    '',
    'Report context:',
    JSON.stringify({
      reportTitle: input.reportTitle,
      accountLabel: input.accountLabel,
      periodLabel: input.periodLabel,
      compareLabel: input.compareLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      compareStart: input.compareStart,
      compareEnd: input.compareEnd,
      includeListGrowth: input.includeListGrowth,
      language: input.language,
      data: compactPayload,
    }),
  ].join('\n')
}
