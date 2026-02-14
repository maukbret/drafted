'use client'

import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { number: 1, label: 'Account' },
  { number: 2, label: 'Profile' },
  { number: 3, label: 'Plan' },
  { number: 4, label: 'Figma' },
  { number: 5, label: 'Klaviyo' },
]

interface OnboardingStepLineProps {
  currentStep: number
  completedSteps: number
  onStepClick?: (step: number) => void
}

export function OnboardingStepLine({ currentStep, completedSteps, onStepClick }: OnboardingStepLineProps) {
  return (
    <div className="flex w-full items-center justify-start">
      {STEPS.map((step, index) => {
        const isCompleted = step.number <= completedSteps
        const isCurrent = step.number === currentStep
        const isFuture = step.number > completedSteps && !isCurrent
        const isClickable = onStepClick && step.number <= completedSteps + 1 && step.number !== currentStep

        return (
          <div key={step.number} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.number)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-1.5 transition-colors',
                isClickable && 'cursor-pointer hover:opacity-80',
                !isClickable && 'cursor-default',
              )}
            >
              {/* Step circle */}
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-medium transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-[#FF4702] text-white ring-2 ring-[#FF4702]/25',
                  isFuture && 'bg-muted text-muted-foreground opacity-40',
                )}
              >
                {isCompleted ? (
                  <Check className="h-2.5 w-2.5" />
                ) : (
                  step.number
                )}
              </div>
              {/* Label - hidden on small screens */}
              <span
                className={cn(
                  'hidden lg:inline text-xs font-medium',
                  isCompleted && 'text-foreground',
                  isCurrent && 'font-semibold text-[#FF4702]',
                  isFuture && 'text-muted-foreground opacity-40',
                )}
              >
                {step.label}
              </span>
            </button>

            {/* Separator chevron */}
            {index < STEPS.length - 1 && (
              <ChevronRight
                className={cn(
                  'mx-2 h-3.5 w-3.5',
                  step.number <= completedSteps ? 'text-primary/70' : 'text-muted-foreground/40',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
