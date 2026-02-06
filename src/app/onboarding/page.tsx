'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { ProfileStep } from './profile-step'
import { PlanSelectionStep } from './plan-selection-step'

function OnboardingContent() {
  const [step, setStep] = useState<'profile' | 'plan'>('profile')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const forceStep = searchParams.get('force')
      const isLocalhost = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      if (process.env.NODE_ENV === 'development' && isLocalhost && (forceStep === 'profile' || forceStep === 'plan')) {
        setStep(forceStep)
        setCheckingAuth(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // Check profile status
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, subscription_selected, full_name')
        .eq('id', user.id)
        .single()

      // If onboarding is fully completed, redirect to app
      if (profile?.onboarding_completed && profile?.subscription_selected) {
        router.push('/campaigns')
        return
      }

      // Determine which step to show
      const stepParam = searchParams.get('step')

      if (stepParam === 'plan') {
        // User explicitly navigated to plan step
        setStep('plan')
      } else if (profile?.full_name && !profile?.subscription_selected) {
        // Profile is set up but subscription not selected
        setStep('plan')
      } else {
        // Start at profile step
        setStep('profile')
      }

      setCheckingAuth(false)
    }

    checkUser()
  }, [supabase, router, searchParams])

  const handleProfileComplete = () => {
    setStep('plan')
    // Update URL without full page reload
    window.history.pushState({}, '', '/onboarding?step=plan')
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className={`w-full ${step === 'plan' ? 'max-w-4xl' : 'max-w-md'}`}>
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`h-2 w-16 rounded-full ${step === 'profile' ? 'bg-primary' : 'bg-primary'}`} />
          <div className={`h-2 w-16 rounded-full ${step === 'plan' ? 'bg-primary' : 'bg-muted'}`} />
        </div>

        {step === 'profile' && (
          <ProfileStep onComplete={handleProfileComplete} />
        )}

        {step === 'plan' && (
          <PlanSelectionStep />
        )}
      </div>
    </main>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
