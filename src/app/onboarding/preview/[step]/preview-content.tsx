'use client'

import { useRouter } from 'next/navigation'

import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { OnboardingStepLine } from '@/components/onboarding-step-line'
import { SignupForm } from '@/components/auth/signup-form'
import {
  STEP_NUMBER_TO_SLUG,
  STEP_SLUG_TO_NUMBER,
  contentMaxWidthForStep,
  mainAlignForStep,
  type OnboardingStepSlug,
} from '@/lib/onboarding-steps'

import { ProfileStep } from '../../profile-step'
import { PlanSelectionStep } from '../../plan-selection-step'
import { FigmaConnectStep } from '../../figma-connect-step'
import { KlaviyoConnectStep } from '../../klaviyo-connect-step'

export function OnboardingPreviewContent({ step }: { step: OnboardingStepSlug }) {
  const router = useRouter()
  const stepNumber = STEP_SLUG_TO_NUMBER[step]
  const noop = () => {}

  return (
    <AuthSplitLayout
      header={
        <div className="flex flex-col gap-3">
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
            UI preview — actions are disabled. Live flow:{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">
              /onboarding
            </code>
            .
          </p>
          <OnboardingStepLine
            currentStep={stepNumber}
            completedSteps={Math.max(0, stepNumber - 1)}
            onStepClick={(n) => {
              const slug = STEP_NUMBER_TO_SLUG[n]
              if (slug) router.push(`/onboarding/preview/${slug}`)
            }}
          />
        </div>
      }
      contentMaxWidth={contentMaxWidthForStep(step)}
      mainAlign={mainAlignForStep(step)}
    >
      {step === 'signup' && <SignupForm isPreview />}
      {step === 'profile' && <ProfileStep onComplete={noop} isPreview />}
      {step === 'plan' && <PlanSelectionStep onComplete={noop} isPreview />}
      {step === 'figma' && (
        <FigmaConnectStep
          onComplete={noop}
          onSkip={noop}
          isPreview
        />
      )}
      {step === 'klaviyo' && (
        <KlaviyoConnectStep
          onComplete={noop}
          onSkip={noop}
          isPreview
        />
      )}
    </AuthSplitLayout>
  )
}
