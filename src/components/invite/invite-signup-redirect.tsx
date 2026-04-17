'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { rememberPendingInviteToken } from '@/lib/auth/pending-invite-token'

/**
 * Unauthenticated visitors to `/invite/[token]` should start account creation, not login.
 * Persist token so onboarding can recover if the auth callback drops `next`.
 */
export function InviteSignupRedirect({ token }: { token: string }) {
  useEffect(() => {
    rememberPendingInviteToken(token)
    const redirectPath = `/invite/${token}`
    window.location.replace(
      `/signup?redirect=${encodeURIComponent(redirectPath)}`,
    )
  }, [token])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Redirecting to sign up…</p>
    </div>
  )
}
