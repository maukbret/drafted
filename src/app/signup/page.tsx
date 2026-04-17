import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { SignupForm } from '@/components/auth/signup-form'
import { sanitizeAuthNextParam } from '@/lib/auth/auth-callback-url'

function firstQueryValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const redirectRaw = firstQueryValue(sp.redirect)
  const redirectTo = sanitizeAuthNextParam(redirectRaw ?? null)

  return (
    <AuthSplitLayout>
      <SignupForm redirectTo={redirectTo} />
    </AuthSplitLayout>
  )
}
