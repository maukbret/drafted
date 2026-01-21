'use client'

import { useState } from 'react'

interface EmailSection {
  id: string
  html: string
  preview: string
  index: number
}

interface FooterSetupProps {
  connectionId: string
  hasFooter: boolean
  onComplete: () => void
  onCancel: () => void
}

export function FooterSetup({ connectionId, hasFooter, onComplete, onCancel }: FooterSetupProps) {
  const [step, setStep] = useState<'input' | 'select' | 'confirm'>('input')
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sections, setSections] = useState<EmailSection[]>([])
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const fetchSections = async () => {
    if (!previewUrl.trim()) {
      setError('Please enter a campaign URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/klaviyo/footer/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewUrl: previewUrl.trim(), connectionId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch preview')
      }

      if (!data.sections || data.sections.length === 0) {
        throw new Error('No sections found in the email preview')
      }

      setSections(data.sections)
      setStep('select')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preview')
    } finally {
      setLoading(false)
    }
  }

  const toggleSection = (section: EmailSection) => {
    setSelectedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section.id)) {
        newSet.delete(section.id)
      } else {
        newSet.add(section.id)
      }
      return newSet
    })
  }

  const proceedToConfirm = () => {
    if (selectedSections.size === 0) {
      setError('Please select at least one section')
      return
    }
    setStep('confirm')
  }

  // Get selected sections in order (by index)
  const getSelectedSectionsOrdered = () => {
    return sections
      .filter(s => selectedSections.has(s.id))
      .sort((a, b) => a.index - b.index)
  }

  // Combine selected sections' HTML
  const getCombinedHtml = () => {
    return getSelectedSectionsOrdered()
      .map(s => s.html)
      .join('\n')
  }

  const saveFooter = async () => {
    if (selectedSections.size === 0) return

    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/klaviyo/footer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          footerHtml: getCombinedHtml(),
          sourceUrl: previewUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save footer')
      }

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save footer')
    } finally {
      setSaving(false)
    }
  }

  const goBack = () => {
    if (step === 'confirm') {
      setStep('select')
    } else if (step === 'select') {
      setSections([])
      setSelectedSections(new Set())
      setStep('input')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {step === 'input' && (hasFooter ? 'Update Footer' : 'Setup Footer')}
              {step === 'select' && 'Select Footer Sections'}
              {step === 'confirm' && 'Confirm Footer'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {step === 'input' && 'Paste a Klaviyo campaign URL to extract your footer'}
              {step === 'select' && 'Select the sections that make up your footer'}
              {step === 'confirm' && 'Is this the correct footer?'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Step 1: Input URL */}
          {step === 'input' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="preview-url" className="block text-sm font-medium mb-1">
                  Campaign URL
                </label>
                <input
                  id="preview-url"
                  type="text"
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  placeholder="https://www.klaviyo.com/campaign/..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Paste any Klaviyo campaign URL that contains your footer
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2">How to get the campaign URL:</h3>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Go to Klaviyo Campaigns</li>
                  <li>Open any campaign that has your footer</li>
                  <li>Copy the URL from your browser address bar</li>
                </ol>
              </div>
            </div>
          )}

          {/* Step 2: Select Section */}
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Found {sections.length} section{sections.length !== 1 ? 's' : ''} in the email. Select all sections that make up your footer:
              </p>
              <div className="space-y-3">
                {sections.map((section) => {
                  const isSelected = selectedSections.has(section.id)
                  return (
                    <button
                      key={section.id}
                      onClick={() => toggleSection(section)}
                      className={`w-full text-left p-4 border rounded-lg transition-colors ${
                        isSelected
                          ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center ${
                          isSelected
                            ? 'bg-black dark:bg-white border-black dark:border-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isSelected && (
                            <svg className="w-4 h-4 text-white dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="flex-shrink-0 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium">
                          {section.index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {section.preview || '(No text content)'}
                          </p>
                          <div
                            className="mt-2 border border-gray-200 dark:border-gray-700 rounded overflow-hidden bg-white"
                            style={{ maxHeight: '150px', overflow: 'hidden' }}
                          >
                            <div
                              className="transform scale-50 origin-top-left"
                              style={{ width: '200%' }}
                              dangerouslySetInnerHTML={{ __html: section.html }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && selectedSections.size > 0 && (
            <div className="space-y-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium">
                    Preview of selected footer ({selectedSections.size} section{selectedSections.size !== 1 ? 's' : ''}):
                  </p>
                </div>
                <div className="p-4">
                  <div
                    dangerouslySetInnerHTML={{ __html: getCombinedHtml() }}
                  />
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This footer will be automatically added to all emails exported from this Klaviyo account.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <div>
            {(step === 'select' || step === 'confirm') && (
              <button
                onClick={goBack}
                className="px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              Cancel
            </button>
            {step === 'input' && (
              <button
                onClick={fetchSections}
                disabled={loading || !previewUrl.trim()}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {loading ? 'Fetching...' : 'Fetch Email'}
              </button>
            )}
            {step === 'select' && (
              <button
                onClick={proceedToConfirm}
                disabled={selectedSections.size === 0}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Continue ({selectedSections.size} selected)
              </button>
            )}
            {step === 'confirm' && (
              <button
                onClick={saveFooter}
                disabled={saving}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Footer'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
