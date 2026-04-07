/**
 * Validates `next` for post-auth redirects — same-origin path only (no open redirects).
 */
export function sanitizeAuthNextParam(next: string | null | undefined): string | null {
  if (!next) return null
  const t = next.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  return t
}

/**
 * `redirectTo` passed to `signInWithOAuth` — must match Supabase URL allowlist.
 */
export function buildAuthCallbackRedirectUrl(
  origin: string,
  next: string | null | undefined
): string {
  const base = `${origin}/api/auth/callback`
  const safe = sanitizeAuthNextParam(next ?? null)
  if (safe) {
    return `${base}?next=${encodeURIComponent(safe)}`
  }
  return base
}
