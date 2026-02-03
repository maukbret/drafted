'use client'

import { Progress } from '@/components/ui/progress'

interface WizardProgressProps {
  currentStep: number
  steps: { label: string; description?: string }[]
}

export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  const progressValue = ((currentStep - 1) / steps.length) * 100

  return (
    <Progress
      value={progressValue}
      className="h-1.5 bg-muted"
      indicatorClassName="bg-[#FF4702]"
    />
  )
}
