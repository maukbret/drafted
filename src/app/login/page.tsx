import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { LoginForm } from '@/components/auth/login-form'

function firstQueryValue(
  v: string | string[] | undefined
): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v[0] !== undefined) return v[0]
  return undefined
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const redirectRaw = firstQueryValue(sp.redirect)
  const errorRaw = firstQueryValue(sp.error)

  return (
    <AuthSplitLayout>
      <LoginForm redirectTo={redirectRaw ?? null} authError={errorRaw ?? null} />
    </AuthSplitLayout>
  )
}
