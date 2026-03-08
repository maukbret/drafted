const PAUSE_VALUES = new Set(['1', 'true', 'yes', 'on'])

/**
 * Analytics is paused by default to prevent background sync/read load.
 * Set ANALYTICS_PAUSED=false (or 0/off/no) to re-enable.
 */
export function isAnalyticsPaused(): boolean {
  const raw = process.env.ANALYTICS_PAUSED

  if (!raw) return true

  return PAUSE_VALUES.has(raw.trim().toLowerCase())
}

export function analyticsPausedResponse() {
  return {
    paused: true,
    error: 'Analytics is temporarily paused',
  }
}
