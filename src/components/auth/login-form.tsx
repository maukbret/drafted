'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button'
import {
  invitePathFromUserMetadata,
  sanitizeAuthNextParam,
} from '@/lib/auth/auth-callback-url'
import { parseAuthHashError } from '@/lib/auth/parse-auth-hash-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function LoginForm({
  className,
  redirectTo: redirectToProp,
  authError: authErrorProp,
  ...props
}: React.ComponentPropsWithoutRef<'form'> & {
  /** From `?redirect=` — pass from server `searchParams` to avoid client searchParams bailout. */
  redirectTo?: string | null
  /** From `?error=` (e.g. OAuth callback). */
  authError?: string | null
}) {
  const redirectTo = sanitizeAuthNextParam(redirectToProp ?? null)
  const authError = authErrorProp ?? null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Supabase puts email-invite / magic-link failures in `location.hash`, not query. */
  const [hashAuthMessage, setHashAuthMessage] = useState<string | null>(null)
  /**
   * Email invites can return implicit-grant tokens in the hash (#access_token=…).
   * createBrowserClient uses flowType "pkce", so GoTrue skips those URLs — recover with setSession.
   */
  const [completingHashInvite, setCompletingHashInvite] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.replace(/^#/, '')

    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash)
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (!access_token || !refresh_token) return

      let cancelled = false
      setCompletingHashInvite(true)

      void (async () => {
        try {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (cancelled) return
          if (sessionError) {
            setHashAuthMessage(sessionError.message)
            setCompletingHashInvite(false)
            return
          }
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${window.location.search}`,
          )
          const user = data.user
          const invitePath = user ? invitePathFromUserMetadata(user) : null
          router.replace(invitePath ?? redirectTo ?? '/campaigns')
          router.refresh()
        } catch (err) {
          if (!cancelled) {
            setHashAuthMessage(err instanceof Error ? err.message : 'Sign-in failed')
            setCompletingHashInvite(false)
          }
        }
      })()

      return () => {
        cancelled = true
        setCompletingHashInvite(false)
      }
    }

    const { error: hashErr, errorCode, errorDescription } = parseAuthHashError(
      window.location.hash,
    )
    if (!hashErr && !errorCode && !errorDescription) return

    const decoded = errorDescription ?? null
    if (errorCode === 'otp_expired' || decoded?.toLowerCase().includes('invalid or has expired')) {
      setHashAuthMessage(
        'This sign-in link has expired or was already used. Invitation and magic links work once and only for a limited time. Ask your admin to send a new invite, or paste the link directly into the browser (some email apps open links in a preview that uses the token early).',
      )
    } else if (decoded) {
      setHashAuthMessage(decoded)
    } else {
      setHashAuthMessage('Sign-in from the email link could not be completed.')
    }

    const path = `${window.location.pathname}${window.location.search}`
    window.history.replaceState(null, '', path)
  }, [supabase, router, redirectTo])

  if (completingHashInvite) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center gap-4 py-12', className)}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Completing sign-in…</p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) throw signInError

      router.push(redirectTo ?? '/campaigns')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      className={cn('flex flex-col gap-6', className)}
      {...props}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your email below to sign in
        </p>
      </div>
      {hashAuthMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Link could not be used</AlertTitle>
          <AlertDescription>{hashAuthMessage}</AlertDescription>
        </Alert>
      ) : null}
      {authError === 'auth_failed' && !hashAuthMessage ? (
        <p className="text-center text-sm text-destructive" role="alert">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      ) : null}
      <div className="grid gap-6">
        <GoogleSignInButton supabase={supabase} nextPath={redirectTo} />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with email
            </span>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="login-password">Password</Label>
          </div>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in with email'
          )}
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href={
            redirectTo
              ? `/signup?redirect=${encodeURIComponent(redirectTo)}`
              : '/signup'
          }
          className="font-medium text-foreground underline underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  )
}
