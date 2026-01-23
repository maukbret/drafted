'use client'

import { useState } from 'react'
import { AudienceSelector } from '../audience-selector'
import { ProgressToast, ProgressStep } from '../progress-toast'
import { KlaviyoAudience } from '@/types/database'

interface Step3SettingsProps {
  campaignId: string
  connectionId: string
  initialName: string
  initialSubjectLine: string
  initialPreviewText: string
  initialIncludedAudiences: KlaviyoAudience[]
  initialExcludedAudiences: KlaviyoAudience[]
  initialScheduledAt: string | null
  isUpdate: boolean
  onComplete: () => void
  onBack: () => void
}

function parseScheduledAt(scheduledAt: string | null): { date: string; time: string } {
  if (!scheduledAt) return { date: '', time: '' }

  try {
    const date = new Date(scheduledAt)
    // Format as YYYY-MM-DD for date input
    const dateStr = date.toISOString().split('T')[0]
    // Format as HH:MM for time input (in local time)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const timeStr = `${hours}:${minutes}`
    return { date: dateStr, time: timeStr }
  } catch {
    return { date: '', time: '' }
  }
}

// Generate steps based on whether it's an update or create
function getInitialSteps(isUpdate: boolean, asDraft: boolean): ProgressStep[] {
  return [
    { id: 'settings', label: 'Saving settings', status: 'pending' },
    // Only show images step for new campaigns (updates already have images uploaded)
    ...(!isUpdate ? [{ id: 'images', label: 'Uploading images', status: 'pending' as const }] : []),
    { id: 'template', label: isUpdate ? 'Updating template' : 'Creating template', status: 'pending' },
    { id: 'campaign', label: isUpdate ? 'Updating campaign' : 'Creating campaign', status: 'pending' },
    { id: 'finalizing', label: asDraft ? 'Saving as draft' : 'Scheduling campaign', status: 'pending' },
  ]
}

// Common timezones with their UTC offsets
const TIMEZONES = [
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)', offset: '+01:00' },
  { value: 'Europe/London', label: 'London (GMT/BST)', offset: '+00:00' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)', offset: '+01:00' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)', offset: '+01:00' },
  { value: 'America/New_York', label: 'New York (EST/EDT)', offset: '-05:00' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)', offset: '-06:00' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)', offset: '-07:00' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)', offset: '-08:00' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)', offset: '-03:00' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: '+09:00' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)', offset: '+08:00' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', offset: '+08:00' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', offset: '+04:00' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)', offset: '+10:00' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)', offset: '+12:00' },
]

export function Step3Settings({
  campaignId,
  connectionId,
  initialName,
  initialSubjectLine,
  initialPreviewText,
  initialIncludedAudiences,
  initialExcludedAudiences,
  initialScheduledAt,
  isUpdate,
  onComplete,
  onBack,
}: Step3SettingsProps) {
  const parsedSchedule = parseScheduledAt(initialScheduledAt)
  const [name, setName] = useState(initialName)
  const [subjectLine, setSubjectLine] = useState(initialSubjectLine)
  const [previewText, setPreviewText] = useState(initialPreviewText || '')
  const [includedAudiences, setIncludedAudiences] = useState<KlaviyoAudience[]>(initialIncludedAudiences || [])
  const [excludedAudiences, setExcludedAudiences] = useState<KlaviyoAudience[]>(initialExcludedAudiences || [])
  const [scheduledDate, setScheduledDate] = useState(() => {
    // Default to today's date if no initial date
    if (parsedSchedule.date) return parsedSchedule.date
    return new Date().toISOString().split('T')[0]
  })
  const [scheduledTime, setScheduledTime] = useState(parsedSchedule.time)
  const [dateOption, setDateOption] = useState<'today' | 'tomorrow' | 'other'>(() => {
    if (!parsedSchedule.date) return 'today'
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    if (parsedSchedule.date === today) return 'today'
    if (parsedSchedule.date === tomorrow) return 'tomorrow'
    return 'other'
  })
  const [timezone, setTimezone] = useState('Europe/Amsterdam')
  const [useRecipientTimezone, setUseRecipientTimezone] = useState(false)
  const [publishOption, setPublishOption] = useState<'draft' | 'schedule'>('draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Progress toast state
  const [showProgress, setShowProgress] = useState(false)
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([])
  const [progressError, setProgressError] = useState<string | null>(null)
  const [klaviyoCampaignId, setKlaviyoCampaignId] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const validateForm = () => {
    if (!name.trim()) {
      setError('Campaign name is required')
      return false
    }

    if (!subjectLine.trim()) {
      setError('Subject line is required')
      return false
    }

    if (includedAudiences.length === 0) {
      setError('Please select at least one audience')
      return false
    }

    return true
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    if (!scheduledDate || !scheduledTime) {
      setError('Please select a date and time')
      return
    }

    setSaving(true)
    setError(null)

    // Reset and show progress toast with correct steps for create vs update
    const asDraft = publishOption === 'draft'
    setProgressSteps(getInitialSteps(isUpdate, asDraft))
    setProgressError(null)
    setKlaviyoCampaignId(null)
    setIsComplete(false)
    setShowProgress(true)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asDraft: publishOption === 'draft',
          settings: {
            name: name.trim(),
            subjectLine: subjectLine.trim(),
            previewText: previewText.trim() || null,
            includedAudiences,
            excludedAudiences,
            scheduledDate,
            scheduledTime,
            timezone,
            useRecipientTimezone,
          },
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) {
        throw new Error('Failed to read response')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const data = JSON.parse(line)

            if (data.step === 'done') {
              setKlaviyoCampaignId(data.klaviyoCampaignId)
              setIsComplete(true)
            } else if (data.step === 'error') {
              setProgressError(data.message)
            } else if (data.status) {
              // Update step status (in_progress, complete, or skip)
              setProgressSteps(prev => {
                if (data.status === 'skip') {
                  // Remove skipped steps entirely
                  return prev.filter(step => step.id !== data.step)
                }
                return prev.map(step => {
                  if (step.id === data.step) {
                    // Update label if provided (e.g., "Updating" vs "Creating")
                    return {
                      ...step,
                      status: data.status,
                      label: data.label || step.label
                    }
                  }
                  return step
                })
              })
            }
          } catch (e) {
            console.error('Failed to parse line:', line, e)
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer)
          if (data.step === 'done') {
            setKlaviyoCampaignId(data.klaviyoCampaignId)
            setIsComplete(true)
          } else if (data.step === 'error') {
            setProgressError(data.message)
          }
        } catch (e) {
          console.error('Failed to parse final buffer:', buffer, e)
        }
      }

    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleCloseProgress = () => {
    setShowProgress(false)
    if (isComplete && !progressError) {
      onComplete()
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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Choose the date and time for this campaign</p>

        <div className="space-y-4">
          {/* Quick date selection */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date()
                setScheduledDate(today.toISOString().split('T')[0])
                setDateOption('today')
              }}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                dateOption === 'today'
                  ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                  : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const tomorrow = new Date()
                tomorrow.setDate(tomorrow.getDate() + 1)
                setScheduledDate(tomorrow.toISOString().split('T')[0])
                setDateOption('tomorrow')
              }}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                dateOption === 'tomorrow'
                  ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                  : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => setDateOption('other')}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                dateOption === 'other'
                  ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                  : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Other
            </button>
          </div>

          {/* Date picker (only shown when "Other" is selected) */}
          <div className="flex gap-3">
            {dateOption === 'other' && (
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={minDate}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
            )}
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div className="relative">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={useRecipientTimezone}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pr-10"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useRecipientTimezone}
              onChange={(e) => setUseRecipientTimezone(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-700"
            />
            <div>
              <span className="text-sm font-medium">Send in recipient&apos;s timezone</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Each recipient receives the email at the selected time in their local timezone
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <h3 className="font-medium mb-4">How to publish</h3>

        <div className="space-y-3">
          <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
            publishOption === 'draft'
              ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-900'
              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
          }`}>
            <input
              type="radio"
              name="publish-option"
              value="draft"
              checked={publishOption === 'draft'}
              onChange={() => setPublishOption('draft')}
              className="w-4 h-4 mt-0.5"
            />
            <div>
              <span className="font-medium">Save as draft</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Review and schedule manually in Klaviyo</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
            publishOption === 'schedule'
              ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-900'
              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
          }`}>
            <input
              type="radio"
              name="publish-option"
              value="schedule"
              checked={publishOption === 'schedule'}
              onChange={() => setPublishOption('schedule')}
              className="w-4 h-4 mt-0.5"
            />
            <div>
              <span className="font-medium">Schedule immediately</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Schedule the campaign for the selected date and time</p>
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
          disabled={saving}
          className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {saving
            ? 'Processing...'
            : publishOption === 'draft'
              ? 'Save Draft to Klaviyo'
              : 'Schedule Campaign'
          }
        </button>
      </div>

      {showProgress && (
        <ProgressToast
          steps={progressSteps}
          error={progressError}
          onClose={handleCloseProgress}
          klaviyoCampaignId={klaviyoCampaignId}
          isComplete={isComplete}
        />
      )}
    </div>
  )
}
