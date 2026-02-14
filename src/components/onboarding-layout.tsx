'use client'

import { OnboardingStepLine } from './onboarding-step-line'

interface OnboardingLayoutProps {
  currentStep: number
  completedSteps: number
  children: React.ReactNode
  onStepClick?: (step: number) => void
}

export function OnboardingLayout({ currentStep, completedSteps, children, onStepClick }: OnboardingLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel - branded */}
      <div className="hidden md:flex w-1/3 items-center justify-center p-8 onboarding-left flex-col gap-6">
          <img
          src="/assets/Favicon.svg"
          alt="Drafted"
          width={48}
          className="opacity-90"
        />
          <div className="space-y-2 justify-center">
            <h1 className="text-2xl font-semibold text-center">Welcome to Drafted</h1>
            <p className="text-center text-md text-muted-foreground text-balance">The easiest way to transform your Figma designs into ready-to-send Klaviyo campaigns.</p>
            </div>
            
      </div>

      {/* Right panel - content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Step line */}
        <div className="px-64px pt-4 pb-2 sm:pl-8 sm:pr-24 sm:pt-5 sm:pb-3">
          <OnboardingStepLine
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={onStepClick}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 flex items-center justify-start px-64px pt-2 pb-8 sm:pl-8 sm:pr-24 sm:pt-4 sm:pb-10 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
