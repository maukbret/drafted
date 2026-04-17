/**
 * Map Supabase Auth Admin `inviteUserByEmail` errors for accurate UI copy.
 * Do not treat every HTTP 422 as "user already exists" — GoTrue uses 422 for many validations.
 */
export function getAuthApiErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code
    return typeof c === 'string' ? c : null
  }
  return null
}

/** True only when GoTrue indicates this email is already an auth user. */
export function isInviteDuplicateAccountError(err: unknown): boolean {
  const code = getAuthApiErrorCode(err)?.toLowerCase() ?? ''
  if (
    code === 'email_exists' ||
    code === 'user_already_registered' ||
    code === 'user_already_exists'
  ) {
    return true
  }

  const msg =
    err && typeof err === 'object' && 'message' in err && typeof (err as Error).message === 'string'
      ? (err as Error).message.toLowerCase()
      : ''

  return (
    msg.includes('user already registered') ||
    msg.includes('already been registered') ||
    msg.includes('email address is already') ||
    msg.includes('a user with this email address has already been registered') ||
    (msg.includes('duplicate') && msg.includes('users'))
  )
}
