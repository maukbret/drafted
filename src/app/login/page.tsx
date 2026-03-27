import { Suspense } from 'react'

import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { LoginForm } from '@/components/auth/login-form'
import { Skeleton } from '@/components/ui/skeleton'

function LoginFormFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto h-4 w-full max-w-[280px]" />
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthSplitLayout>
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </AuthSplitLayout>
  )
}
