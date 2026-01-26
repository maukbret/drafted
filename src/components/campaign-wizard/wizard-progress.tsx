'use client'

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
            className="flex-1 rounded-full transition-colors"
            style={{
              backgroundColor: isActiveOrCompleted ? '#FF4702' : 'rgba(0, 0, 0, 0.1)',
              height: 5,
            }}
          />
        )
      })}
    </div>
  )
}
