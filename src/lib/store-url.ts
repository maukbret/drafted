export function normalizeStoreUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

export function isValidStoreUrl(input: string): boolean {
  const normalized = normalizeStoreUrl(input)
  if (!normalized) return false

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  const hostname = parsed.hostname.trim().toLowerCase()
  if (!hostname || hostname === 'localhost' || !hostname.includes('.')) {
    return false
  }

  return true
}

export function validateStoreUrl(input: string): { valid: true; normalized: string } | { valid: false; error: string } {
  const normalized = normalizeStoreUrl(input)

  if (!normalized) {
    return { valid: false, error: 'Please enter a store URL' }
  }

  if (!isValidStoreUrl(normalized)) {
    return { valid: false, error: 'Enter a valid store URL (e.g. https://yourstore.com)' }
  }

  return { valid: true, normalized }
}

export function getStoreDomain(storeUrl: string | null | undefined): string | null {
  if (!storeUrl) return null

  let parsed: URL
  try {
    parsed = new URL(normalizeStoreUrl(storeUrl))
  } catch {
    return null
  }

  const hostname = parsed.hostname.trim().toLowerCase()
  if (!hostname) return null

  return hostname.startsWith('www.') ? hostname.slice(4) : hostname
}

export function getGoogleFaviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
}
