interface FigmaCooldownEntry {
  expiresAtMs: number
  planTier: string | null
  rateLimitType: string | null
  upgradeUrl: string | null
}

const figmaRateLimitCooldowns = new Map<string, FigmaCooldownEntry>()

export interface FigmaRateLimitDetails {
  retryAfterSec: number
  planTier: string | null
  rateLimitType: string | null
  upgradeUrl: string | null
}

export interface FigmaActiveCooldown extends FigmaRateLimitDetails {
  remainingSec: number
}

export interface FigmaApiFetchOptions extends Omit<RequestInit, 'headers'> {
  accessToken: string
  headers?: HeadersInit
  cooldownKey?: string
  max429Retries?: number
  maxAutoRetryAfterSec?: number
  allow429AutoRetry?: boolean
}

export class FigmaRateLimitError extends Error {
  readonly details: FigmaRateLimitDetails

  constructor(message: string, details: FigmaRateLimitDetails) {
    super(message)
    this.name = 'FigmaRateLimitError'
    this.details = details
  }
}

const DEFAULT_429_RETRIES = 1
const DEFAULT_MAX_AUTO_RETRY_AFTER_SEC = 30
const DEFAULT_IMAGE_TARGET_WIDTH = 1080
const DEFAULT_IMAGE_BASE_WIDTH = 600
const MIN_IMAGE_SCALE = 0.01
const MAX_IMAGE_SCALE = 4

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfter(headers: Headers): number {
  const raw = headers.get('retry-after')
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.ceil(parsed)
}

function parseRateLimitDetails(headers: Headers): FigmaRateLimitDetails {
  return {
    retryAfterSec: parseRetryAfter(headers),
    planTier: headers.get('x-figma-plan-tier'),
    rateLimitType: headers.get('x-figma-rate-limit-type'),
    upgradeUrl: headers.get('x-figma-upgrade-link'),
  }
}

function setFigmaCooldown(key: string, details: FigmaRateLimitDetails) {
  figmaRateLimitCooldowns.set(key, {
    expiresAtMs: Date.now() + details.retryAfterSec * 1000,
    planTier: details.planTier,
    rateLimitType: details.rateLimitType,
    upgradeUrl: details.upgradeUrl,
  })
}

function getFigmaCooldown(key: string): FigmaActiveCooldown | null {
  const entry = figmaRateLimitCooldowns.get(key)
  if (!entry) return null

  const remainingMs = entry.expiresAtMs - Date.now()
  if (remainingMs <= 0) {
    figmaRateLimitCooldowns.delete(key)
    return null
  }

  const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000))
  return {
    remainingSec,
    retryAfterSec: remainingSec,
    planTier: entry.planTier,
    rateLimitType: entry.rateLimitType,
    upgradeUrl: entry.upgradeUrl,
  }
}

export function getFigmaCooldownSeconds(key: string): number {
  return getFigmaCooldown(key)?.remainingSec ?? 0
}

export async function figmaApiFetch(url: string, options: FigmaApiFetchOptions): Promise<Response> {
  const {
    accessToken,
    headers,
    cooldownKey,
    max429Retries = DEFAULT_429_RETRIES,
    maxAutoRetryAfterSec = DEFAULT_MAX_AUTO_RETRY_AFTER_SEC,
    allow429AutoRetry = true,
    ...requestInit
  } = options

  if (cooldownKey) {
    const activeCooldown = getFigmaCooldown(cooldownKey)
    if (activeCooldown) {
      throw new FigmaRateLimitError('Figma API cooldown is active', activeCooldown)
    }
  }

  let retryCount = 0

  while (true) {
    const requestHeaders = new Headers(headers)
    requestHeaders.set('Authorization', `Bearer ${accessToken}`)

    const response = await fetch(url, {
      ...requestInit,
      headers: requestHeaders,
    })

    if (response.status !== 429) {
      return response
    }

    const details = parseRateLimitDetails(response.headers)

    if (cooldownKey) {
      setFigmaCooldown(cooldownKey, details)
    }

    const shouldRetry =
      allow429AutoRetry &&
      retryCount < max429Retries &&
      details.retryAfterSec <= maxAutoRetryAfterSec

    if (!shouldRetry) {
      throw new FigmaRateLimitError('Figma API rate limit reached', details)
    }

    retryCount += 1
    await sleep(details.retryAfterSec * 1000)
  }
}

export function getFigmaImageExportScale(width: number, targetWidth = DEFAULT_IMAGE_TARGET_WIDTH): string {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_IMAGE_BASE_WIDTH
  const rawScale = targetWidth / safeWidth
  const clampedScale = Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, rawScale))
  return clampedScale.toFixed(4).replace(/\.?0+$/, '')
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (remainder === 0) {
    return `${minutes}m`
  }

  return `${minutes}m ${remainder}s`
}

export function buildFigmaRateLimitMessage(details: FigmaRateLimitDetails): string {
  const parts: string[] = ['Figma rate limit reached.']

  if (details.rateLimitType === 'low') {
    parts.push('Your Figma seat currently has low API request limits.')
  }

  parts.push(`Try again in ${formatDuration(details.retryAfterSec)}.`)

  return parts.join(' ')
}
