'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function SignupForm({
  className,
  isPreview = false,
  ...props
}: React.ComponentPropsWithoutRef<'form'> & { isPreview?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupComplete, setSignupComplete] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPreview) {
      toast.message('Preview mode', {
        description: 'Sign up is disabled on this static preview page.',
      })
      return
    }
    setLoading(true)
    setError(null)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      })
      if (signUpError) throw signUpError
      if (data?.user && data.user.identities && data.user.identities.length === 0) {
        setError('An account with this email already exists')
        return
      }

      setSignupComplete(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (signupComplete) {
    return (
      <div className={cn('flex flex-col gap-6', className)}>
        <div className="flex flex-col gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="size-6 text-primary" aria-hidden />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-muted-foreground">
              We&apos;ve sent a confirmation link to{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Click the link in the email to verify your account and continue
            setup.
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Already verified?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form
      className={cn('flex flex-col gap-6', className)}
      {...props}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your email below to create your account
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
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
          <Label htmlFor="signup-password">Password</Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Must be at least 6 characters
          </p>
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
              Creating account...
            </>
          ) : (
            'Sign up with email'
          )}
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  )
}
