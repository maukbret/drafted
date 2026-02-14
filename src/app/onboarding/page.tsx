'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding-layout'
import { SignupStep } from './signup-step'
import { ProfileStep } from './profile-step'
import { PlanSelectionStep } from './plan-selection-step'
import { FigmaConnectStep } from './figma-connect-step'
import { KlaviyoConnectStep } from './klaviyo-connect-step'

type OnboardingStep = 'signup' | 'profile' | 'plan' | 'figma' | 'klaviyo'

const STEP_MAP: Record<OnboardingStep, number> = {
  signup: 1,
  profile: 2,
  plan: 3,
  figma: 4,
  klaviyo: 5,
}

const STEP_REVERSE: Record<number, OnboardingStep> = {
  1: 'signup',
  2: 'profile',
  3: 'plan',
  4: 'figma',
  5: 'klaviyo',
}

function OnboardingContent() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('signup')
  const [completedSteps, setCompletedSteps] = useState(0)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [initialSuccess, setInitialSuccess] = useState<string | null>(null)
  const [newConnectionId, setNewConnectionId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      // Dev mode: ?force=signup|profile|plan|figma|klaviyo skips all auth/DB checks
      const forceStep = searchParams.get('force') as OnboardingStep | null
      const isLocalhost = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      if (process.env.NODE_ENV === 'development' && isLocalhost && forceStep && STEP_MAP[forceStep] !== undefined) {
        setCurrentStep(forceStep)
        setCompletedSteps(STEP_MAP[forceStep] - 1)
        setCheckingAuth(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()

      // No user = show signup (step 1)
      if (!user) {
        setCurrentStep('signup')
        setCompletedSteps(0)
        setCheckingAuth(false)
        return
      }

      // Check profile status
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, subscription_selected, full_name, onboarding_step')
        .eq('id', user.id)
        .single()

      // If onboarding is fully completed, redirect to app
      if (profile?.onboarding_completed) {
        router.push('/campaigns')
        return
      }

      // Read URL params
      const stepParam = searchParams.get('step') as OnboardingStep | null
      const successParam = searchParams.get('success')
      const newConnId = searchParams.get('newConnectionId')

      if (successParam) setInitialSuccess(successParam)
      if (newConnId) setNewConnectionId(newConnId)

      // Determine DB step (user exists so signup is done = at least 1)
      const dbStep = Math.max(profile?.onboarding_step || 1, 1)
      setCompletedSteps(dbStep)

      // Determine which step to show: URL param takes priority, then DB state
      if (stepParam && STEP_MAP[stepParam]) {
        setCurrentStep(stepParam)
      } else if (dbStep >= 5) {
        setCurrentStep('klaviyo')
      } else if (dbStep >= 4) {
        setCurrentStep('figma')
      } else if (dbStep >= 3) {
        setCurrentStep('figma')
      } else if (dbStep >= 2) {
        setCurrentStep('plan')
      } else if (profile?.full_name) {
        setCurrentStep('plan')
      } else {
        setCurrentStep('profile')
      }

      setCheckingAuth(false)
    }

    checkUser()
  }, [supabase, router, searchParams])

  const advanceToStep = useCallback((step: OnboardingStep) => {
    setCurrentStep(step)
    const stepNumber = STEP_MAP[step]
    setCompletedSteps(prev => Math.max(prev, stepNumber - 1))
    window.history.pushState({}, '', `/onboarding?step=${step}`)
  }, [])

  const handleStepClick = useCallback((stepNumber: number) => {
    const step = STEP_REVERSE[stepNumber]
    if (step && stepNumber <= completedSteps + 1) {
      setCurrentStep(step)
      window.history.pushState({}, '', `/onboarding?step=${step}`)
    }
  }, [completedSteps])

  const handleProfileComplete = useCallback(() => {
    setCompletedSteps(prev => Math.max(prev, 2))
    advanceToStep('plan')
  }, [advanceToStep])

  const handlePlanComplete = useCallback(() => {
    setCompletedSteps(prev => Math.max(prev, 3))
    advanceToStep('figma')
  }, [advanceToStep])

  const handleFigmaComplete = useCallback(() => {
    setCompletedSteps(prev => Math.max(prev, 4))
    advanceToStep('klaviyo')
  }, [advanceToStep])

  const handleFigmaSkip = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_step: 4 })
        .eq('id', user.id)
    }
    setCompletedSteps(prev => Math.max(prev, 4))
    advanceToStep('klaviyo')
  }, [supabase, advanceToStep])

  const handleKlaviyoComplete = useCallback(() => {
    router.push('/campaigns')
  }, [router])

  const handleKlaviyoSkip = useCallback(() => {
    router.push('/campaigns')
  }, [router])

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const stepNumber = STEP_MAP[currentStep]

  return (
    <OnboardingLayout
      currentStep={stepNumber}
      completedSteps={completedSteps}
      onStepClick={handleStepClick}
    >
      {currentStep === 'signup' && (
        <div className="w-full max-w-sm">
          <SignupStep />
        </div>
      )}

      {currentStep === 'profile' && (
        <div className="w-full max-w-md">
          <ProfileStep onComplete={handleProfileComplete} />
        </div>
      )}

      {currentStep === 'plan' && (
        <div className="w-full max-w-4xl">
          <PlanSelectionStep onComplete={handlePlanComplete} />
        </div>
      )}

      {currentStep === 'figma' && (
        <div className="w-full max-w-md">
          <FigmaConnectStep
            onComplete={handleFigmaComplete}
            onSkip={handleFigmaSkip}
            initialSuccess={initialSuccess === 'figma_connected'}
          />
        </div>
      )}

      {currentStep === 'klaviyo' && (
        <div className="w-full max-w-md">
          <KlaviyoConnectStep
            onComplete={handleKlaviyoComplete}
            onSkip={handleKlaviyoSkip}
            initialSuccess={initialSuccess === 'klaviyo_connected'}
            newConnectionId={newConnectionId}
          />
        </div>
      )}
    </OnboardingLayout>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
