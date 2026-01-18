'use client'

interface WizardProgressProps {
  currentStep: number
  steps: { label: string; description?: string }[]
}

export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const stepNumber = index + 1
        const isActive = stepNumber === currentStep
        const isCompleted = stepNumber < currentStep

        return (
          <div key={index} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isActive
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  isActive
                    ? 'text-black dark:text-white'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 ${
                  isCompleted
                    ? 'bg-green-500'
                    : 'bg-gray-200 dark:bg-gray-800'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
