'use client'

export interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'complete'
}

interface ProgressToastProps {
  steps: ProgressStep[]
  error?: string | null
  onClose: () => void
  klaviyoCampaignId?: string | null
  isComplete: boolean
}

export function ProgressToast({
  steps,
  error,
  onClose,
  klaviyoCampaignId,
  isComplete,
}: ProgressToastProps) {
  const klaviyoUrl = klaviyoCampaignId
    ? `https://www.klaviyo.com/campaign/${klaviyoCampaignId}/scheduled`
    : null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="font-medium text-sm">
          {error
            ? 'Error'
            : isComplete
              ? 'Campaign created!'
              : 'Creating campaign...'}
        </span>
        {(isComplete || error) && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-2">
        {error ? (
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-2 text-sm ${
                step.status === 'complete' ? 'text-gray-400 dark:text-gray-500' : ''
              }`}
            >
              {step.status === 'pending' && (
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                </div>
              )}
              {step.status === 'in_progress' && (
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg className="w-4 h-4 animate-spin text-black dark:text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
              {step.status === 'complete' && (
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <span>{step.label}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer with actions */}
      {(isComplete || error) && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          {klaviyoUrl && !error && (
            <a
              href={klaviyoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              View in Klaviyo
            </a>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
