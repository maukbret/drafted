'use client'

import { cn } from '@/lib/utils'

interface WizardProgressProps {
  currentStep: number
  steps: { label: string; description?: string }[]
}

export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  return (
    <div className="flex gap-2 mb-8">
      {steps.map((_, index) => {
        const stepNumber = index + 1
        const isActiveOrCompleted = stepNumber <= currentStep

        return (
          <div
            key={index}
            className={cn(
              'flex-1 h-1.5 rounded-full transition-colors',
              isActiveOrCompleted ? 'bg-[#FF4702]' : 'bg-muted'
            )}
          />
        )
      })}
    </div>
  )
}
