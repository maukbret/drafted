'use client'

import { useState } from 'react'
import { AudienceSelector } from '../audience-selector'
import { KlaviyoAudience } from '@/types/database'

interface Step3SettingsProps {
  campaignId: string
  connectionId: string
  initialName: string
  initialSubjectLine: string
  initialPreviewText: string
  initialIncludedAudiences: KlaviyoAudience[]
  initialExcludedAudiences: KlaviyoAudience[]
  onComplete: () => void
  onBack: () => void
}

export function Step3Settings({
  campaignId,
  connectionId,
  initialName,
  initialSubjectLine,
  initialPreviewText,
  initialIncludedAudiences,
  initialExcludedAudiences,
  onComplete,
  onBack,
}: Step3SettingsProps) {
  const [name, setName] = useState(initialName)
  const [subjectLine, setSubjectLine] = useState(initialSubjectLine)
  const [previewText, setPreviewText] = useState(initialPreviewText || '')
  const [includedAudiences, setIncludedAudiences] = useState<KlaviyoAudience[]>(initialIncludedAudiences || [])
  const [excludedAudiences, setExcludedAudiences] = useState<KlaviyoAudience[]>(initialExcludedAudiences || [])
  const [sendOption, setSendOption] = useState<'now' | 'schedule'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!name.trim()) {
      setError('Campaign name is required')
      return
    }

    if (!subjectLine.trim()) {
      setError('Subject line is required')
      return
    }

    if (includedAudiences.length === 0) {
      setError('Please select at least one audience')
      return
    }

    if (sendOption === 'schedule' && (!scheduledDate || !scheduledTime)) {
      setError('Please select a date and time to schedule')
      return
    }

    setSending(true)
    setError(null)

    try {
      // Calculate scheduled_at if scheduling
      let scheduled_at: string | null = null
      if (sendOption === 'schedule' && scheduledDate && scheduledTime) {
        const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
        scheduled_at = scheduledDateTime.toISOString()
      }

      // Update campaign settings
      const updateResponse = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          subject_line: subjectLine.trim(),
          preview_text: previewText.trim() || null,
          included_audiences: includedAudiences,
          excluded_audiences: excludedAudiences,
          scheduled_at,
        }),
      })

      if (!updateResponse.ok) {
        const data = await updateResponse.json()
        throw new Error(data.error || 'Failed to update campaign')
      }

      // Send the campaign
      const sendResponse = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!sendResponse.ok) {
        const data = await sendResponse.json()
        throw new Error(data.error || 'Failed to send campaign')
      }

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSending(false)
    }
  }

  // Get minimum date/time for scheduling (now + 5 minutes)
  const now = new Date()
  const minDate = now.toISOString().split('T')[0]

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <label htmlFor="campaign-name" className="block text-sm font-medium mb-1">
          Campaign name
        </label>
        <input
          id="campaign-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Email Campaign"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Internal name for this campaign
        </p>
      </div>

      <div>
        <label htmlFor="subject-line" className="block text-sm font-medium mb-1">
          Subject line
        </label>
        <input
          id="subject-line"
          type="text"
          value={subjectLine}
          onChange={(e) => setSubjectLine(e.target.value)}
          placeholder="Your email subject"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
        />
      </div>

      <div>
        <label htmlFor="preview-text" className="block text-sm font-medium mb-1">
          Preview text <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="preview-text"
          type="text"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="Preview text shown in inbox"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
        />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <h3 className="font-medium mb-4">Audience</h3>

        <div className="space-y-4">
          <AudienceSelector
            connectionId={connectionId}
            selectedAudiences={includedAudiences}
            onChange={setIncludedAudiences}
            label="Send to"
            placeholder="Select lists or segments to include..."
          />

          <AudienceSelector
            connectionId={connectionId}
            selectedAudiences={excludedAudiences}
            onChange={setExcludedAudiences}
            label="Exclude (optional)"
            placeholder="Select lists or segments to exclude..."
          />
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <h3 className="font-medium mb-4">When to send</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
            <input
              type="radio"
              name="send-option"
              value="now"
              checked={sendOption === 'now'}
              onChange={() => setSendOption('now')}
              className="w-4 h-4"
            />
            <div>
              <span className="font-medium">Send now</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Send immediately after review</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
            <input
              type="radio"
              name="send-option"
              value="schedule"
              checked={sendOption === 'schedule'}
              onChange={() => setSendOption('schedule')}
              className="w-4 h-4 mt-1"
            />
            <div className="flex-1">
              <span className="font-medium">Schedule for later</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Choose a specific date and time</p>

              {sendOption === 'schedule' && (
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={minDate}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={sending}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="flex-1 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {sending ? 'Sending...' : sendOption === 'now' ? 'Send Campaign' : 'Schedule Campaign'}
        </button>
      </div>
    </div>
  )
}
