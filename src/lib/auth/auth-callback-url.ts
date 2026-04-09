import type { User } from '@supabase/supabase-js'

/**
 * `inviteUserByEmail(..., { data: { team_invite_token } })` stores this on the user.
 * If Supabase falls back to `redirect_to` = Site URL only (root), the `next` query is lost;
 * we still deep-link to the invite page after code exchange.
 */
export function invitePathFromUserMetadata(user: User): string | null {
  const raw = user.user_metadata?.team_invite_token
  if (typeof raw !== 'string' || !raw.trim()) return null
  const token = raw.trim()
  if (!/^[a-f0-9]{32,}$/i.test(token)) return null
  return `/invite/${token}`
}

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
