import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react'

export type StepStatus = 'completed' | 'active' | 'pending' | 'error'

export interface GenerationStep {
  id: string
  label: string
  description: string
}

export function getStepStatus(stepIndex: number, activeStepIndex: number): StepStatus {
  if (stepIndex < activeStepIndex) return 'completed'
  if (stepIndex === activeStepIndex) return 'active'
  return 'pending'
}

export function GenerationStepRow({
  step,
  status,
}: {
  step: GenerationStep
  status: StepStatus
}) {
  return (
    <div
      className={`relative flex items-center gap-3.5 rounded-xl border px-4 py-3.5 transition-all duration-500 ${
        status === 'completed'
          ? 'border-emerald-200 bg-emerald-50/70'
          : status === 'active'
            ? 'border-orange-200 bg-white shadow-sm'
            : status === 'error'
              ? 'border-red-200 bg-red-50/70'
              : 'border-transparent bg-muted/40'
      }`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {status === 'completed' && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </div>
        )}
        {status === 'active' && (
          <div className="flex h-6 w-6 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          </div>
        )}
        {status === 'error' && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
            <AlertCircle className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </div>
        )}
        {status === 'pending' && (
          <div className="flex h-6 w-6 items-center justify-center">
            <Circle className="h-4 w-4 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Label and description */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium transition-colors duration-500 ${
            status === 'completed'
              ? 'text-emerald-700'
              : status === 'active'
                ? 'text-foreground'
                : status === 'error'
                  ? 'text-red-700'
                  : 'text-muted-foreground/60'
          }`}
        >
          {step.label}
        </p>
        {(status === 'active' || status === 'error') && (
          <p className={`mt-0.5 text-xs ${status === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
            {step.description}
          </p>
        )}
      </div>

      {/* Status badge for active step */}
      {status === 'active' && (
        <span className="flex-shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-600">
          In progress
        </span>
      )}

      {/* Subtle gradient overlay for active step */}
      {status === 'active' && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-transparent to-orange-50/80" />
      )}
    </div>
  )
}
