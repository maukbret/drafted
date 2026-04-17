/** Survives OAuth/verify round-trips when `next` is missing from the callback URL (open share links). */
export const PENDING_INVITE_TOKEN_STORAGE_KEY = 'mauk_pending_invite_token'

export function rememberPendingInviteToken(token: string): void {
  if (typeof window === 'undefined') return
  if (!/^[a-f0-9]{32,}$/i.test(token)) return
  try {
    sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, token)
  } catch {
    /* quota / private mode */
  }
}

export function readPendingInviteToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PENDING_INVITE_TOKEN_STORAGE_KEY)
    if (!raw || !/^[a-f0-9]{32,}$/i.test(raw)) return null
    return raw
  } catch {
    return null
  }
}

export function pendingInvitePathFromToken(token: string | null): string | null {
  if (!token) return null
  return `/invite/${token}`
}

export function clearPendingInviteToken(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
