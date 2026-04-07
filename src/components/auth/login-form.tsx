'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button'
import { sanitizeAuthNextParam } from '@/lib/auth/auth-callback-url'
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

  const router = useRouter()
  const supabase = createClient()

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
      {authError === 'auth_failed' ? (
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
          href="/signup"
          className="font-medium text-foreground underline underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  )
}
