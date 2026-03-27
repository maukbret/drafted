'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { OnboardingStepLine } from '@/components/onboarding-step-line'
import { SignupForm } from '@/components/auth/signup-form'
import {
  STEP_NUMBER_TO_SLUG,
  STEP_SLUG_TO_NUMBER,
  contentMaxWidthForStep,
  isOnboardingStepSlug,
  mainAlignForStep,
  type OnboardingStepKey,
} from '@/lib/onboarding-steps'

import { ProfileStep } from './profile-step'
import { PlanSelectionStep } from './plan-selection-step'
import { FigmaConnectStep } from './figma-connect-step'
import { KlaviyoConnectStep } from './klaviyo-connect-step'

type OnboardingStep = OnboardingStepKey

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
      const forceStep = searchParams.get('force')
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1')

      if (
        process.env.NODE_ENV === 'development' &&
        isLocalhost &&
        forceStep &&
        isOnboardingStepSlug(forceStep)
      ) {
        router.replace(`/onboarding/preview/${forceStep}`)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setCurrentStep('signup')
        setCompletedSteps(0)
        setCheckingAuth(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, subscription_selected, full_name, onboarding_step')
        .eq('id', user.id)
        .single()

      if (profile?.onboarding_completed) {
        router.push('/campaigns')
        return
      }

      const stepParam = searchParams.get('step')
      const successParam = searchParams.get('success')
      const newConnId = searchParams.get('newConnectionId')

      if (successParam) setInitialSuccess(successParam)
      if (newConnId) setNewConnectionId(newConnId)

      const dbStep = Math.max(profile?.onboarding_step || 1, 1)
      setCompletedSteps(dbStep)

      if (stepParam && isOnboardingStepSlug(stepParam)) {
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
    const n = STEP_SLUG_TO_NUMBER[step]
    setCompletedSteps((prev) => Math.max(prev, n - 1))
    window.history.pushState({}, '', `/onboarding?step=${step}`)
  }, [])

  const handleStepClick = useCallback(
    (stepNumber: number) => {
      const step = STEP_NUMBER_TO_SLUG[stepNumber]
      if (step && stepNumber <= completedSteps + 1) {
        setCurrentStep(step)
        window.history.pushState({}, '', `/onboarding?step=${step}`)
      }
    },
    [completedSteps]
  )

  const handleProfileComplete = useCallback(() => {
    setCompletedSteps((prev) => Math.max(prev, 2))
    advanceToStep('plan')
  }, [advanceToStep])

  const handlePlanComplete = useCallback(() => {
    setCompletedSteps((prev) => Math.max(prev, 3))
    advanceToStep('figma')
  }, [advanceToStep])

  const handleFigmaComplete = useCallback(() => {
    setCompletedSteps((prev) => Math.max(prev, 4))
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
    setCompletedSteps((prev) => Math.max(prev, 4))
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

  const stepNumber = STEP_SLUG_TO_NUMBER[currentStep]

  return (
    <AuthSplitLayout
      header={
        <OnboardingStepLine
          currentStep={stepNumber}
          completedSteps={completedSteps}
          onStepClick={handleStepClick}
        />
      }
      contentMaxWidth={contentMaxWidthForStep(currentStep)}
      mainAlign={mainAlignForStep(currentStep)}
    >
      {currentStep === 'signup' && <SignupForm />}

      {currentStep === 'profile' && (
        <ProfileStep onComplete={handleProfileComplete} />
      )}

      {currentStep === 'plan' && (
        <PlanSelectionStep onComplete={handlePlanComplete} />
      )}

      {currentStep === 'figma' && (
        <FigmaConnectStep
          onComplete={handleFigmaComplete}
          onSkip={handleFigmaSkip}
          initialSuccess={initialSuccess === 'figma_connected'}
        />
      )}

      {currentStep === 'klaviyo' && (
        <KlaviyoConnectStep
          onComplete={handleKlaviyoComplete}
          onSkip={handleKlaviyoSkip}
          initialSuccess={initialSuccess === 'klaviyo_connected'}
          newConnectionId={newConnectionId}
        />
      )}
    </AuthSplitLayout>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  )
}
