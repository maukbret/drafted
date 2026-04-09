/**
 * Supabase Auth puts OAuth-style errors in the URL **hash** after failed email / PKCE flows,
 * e.g. #error=access_denied&error_code=otp_expired&error_description=...
 * (Fragments are never sent to the server, so this must run client-side.)
 */
export function parseAuthHashError(hash: string): {
  error: string | null
  errorCode: string | null
  errorDescription: string | null
} {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) {
    return { error: null, errorCode: null, errorDescription: null }
  }
  const params = new URLSearchParams(raw)
  return {
    error: params.get('error'),
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
  }
}
