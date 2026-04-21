import 'server-only'

const JITTER_MS_MAX = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Wait time after HTTP 429 before retrying. Prefer `Retry-After`, then Klaviyo error `detail`. */
export function klaviyo429RetryWaitMs(retryAfterHeader: string | null, errorBody: string): number {
  const headerSec = Number(retryAfterHeader)
  if (Number.isFinite(headerSec) && headerSec >= 0) {
    return Math.max(500, Math.ceil(headerSec * 1000) + 500)
  }

  const match = errorBody.match(/available in\s+(\d+)\s+seconds?/i)
  if (match) {
    const sec = Number(match[1])
    if (Number.isFinite(sec) && sec >= 0) {
      return Math.max(500, sec * 1000 + 500)
    }
  }

  return 1500
}

function serviceUnavailableWaitMs(attemptIndex: number): number {
  const base = 1000 * 2 ** Math.min(attemptIndex, 5)
  return Math.min(30_000, base) + Math.floor(Math.random() * JITTER_MS_MAX)
}

/**
 * Performs a Klaviyo `fetch` and transparently retries on 429 / 503 per
 * https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
 */
export async function fetchWithKlaviyoRateLimitRetry(
  url: string,
  init: RequestInit,
  options?: { maxAttempts?: number; logLabel?: string }
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 8
  const logLabel = options?.logLabel ?? 'Klaviyo'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, init)

    if (response.ok) {
      return response
    }

    const isLast = attempt >= maxAttempts

    if (response.status === 429 && !isLast) {
      const bodyText = await response.text().catch(() => '')
      const waitMs = klaviyo429RetryWaitMs(response.headers.get('retry-after'), bodyText) + Math.floor(
        Math.random() * JITTER_MS_MAX
      )
      console.warn(`[${logLabel}] Throttled (429), retrying in ${waitMs}ms (${attempt}/${maxAttempts})`)
      await sleep(waitMs)
      continue
    }

    if (response.status === 503 && !isLast) {
      await response.text().catch(() => '')
      const waitMs = serviceUnavailableWaitMs(attempt - 1)
      console.warn(`[${logLabel}] Service unavailable (503), retrying in ${waitMs}ms (${attempt}/${maxAttempts})`)
      await sleep(waitMs)
      continue
    }

    return response
  }

  throw new Error(`[${logLabel}] Rate-limit retry loop ended unexpectedly`)
}
