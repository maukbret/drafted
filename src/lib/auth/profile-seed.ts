import type { User } from '@supabase/supabase-js'

function firstIdentityData(user: User): Record<string, unknown> | null {
  const list = user.identities
  if (!Array.isArray(list) || list.length === 0) return null
  const row =
    list.find((i) => i.provider === 'google') ?? list[0]
  const data = row?.identity_data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return null
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return null
}

/**
 * Map OAuth user (e.g. Google) into profiles columns.
 * Picture often lives in identities[].identity_data before user_metadata is fully synced.
 */
export function profileSeedFromOAuthUser(user: User): {
  full_name: string | null
  avatar_url: string | null
} {
  const meta = user.user_metadata ?? {}
  const idData = firstIdentityData(user)

  const full_name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta.name === 'string' && meta.name.trim()
        ? meta.name.trim()
        : null) ?? (idData ? pickString(idData, ['full_name', 'name']) : null)

  const avatar_url =
    (typeof meta.avatar_url === 'string' && meta.avatar_url
      ? meta.avatar_url
      : typeof meta.picture === 'string' && meta.picture
        ? meta.picture
        : null) ??
    (idData ? pickString(idData, ['avatar_url', 'picture']) : null)

  return { full_name, avatar_url }
}
