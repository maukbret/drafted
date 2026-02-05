'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, HelpCircle } from 'lucide-react'
import { AudienceSelector } from '../audience-selector'
import { ProgressToast, ProgressStep } from '../progress-toast'
import { KlaviyoAudience } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

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
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [useRecipientTimezone, setUseRecipientTimezone] = useState(false)
  const [publishOption, setPublishOption] = useState<'draft' | 'schedule'>('draft')
  const [useCustomFooter, setUseCustomFooter] = useState(true)
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
            useCustomFooter,
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
      <div className="space-y-2">
        <Label htmlFor="campaign-name">Campaign name</Label>
        <Input
          id="campaign-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Email Campaign"
        />
        <p className="text-xs text-muted-foreground">
          Internal name for this campaign
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject-line">Subject line</Label>
        <Input
          id="subject-line"
          type="text"
          value={subjectLine}
          onChange={(e) => setSubjectLine(e.target.value)}
          placeholder="Your email subject"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="preview-text">
            Preview text <span className="text-muted-foreground">(optional)</span>
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">The preview text appears after the subject line in most email clients. It gives recipients a glimpse of the email content.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="preview-text"
          type="text"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="Preview text shown in inbox"
        />
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Audience</h3>

        <div className="space-y-6">
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

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">When to send</h3>

        <div className="space-y-6">
          <div className="space-y-6">
            <Tabs
              value={dateOption}
              onValueChange={(value) => {
                if (value === 'today') {
                  const today = new Date()
                  setScheduledDate(today.toISOString().split('T')[0])
                }
                if (value === 'tomorrow') {
                  const tomorrow = new Date()
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  setScheduledDate(tomorrow.toISOString().split('T')[0])
                }
                setDateOption(value as 'today' | 'tomorrow' | 'other')
              }}
            >
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>
            </Tabs>

            <div
              className={cn(
                "grid grid-cols-1 gap-3",
                dateOption === 'other'
                  ? "md:grid-cols-[160px_140px_1fr]"
                  : "md:grid-cols-[140px_1fr]"
              )}
            >
              {dateOption === 'other' && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={minDate}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Timezone</Label>
                <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={timezoneOpen}
                      disabled={useRecipientTimezone}
                      className="w-full justify-between font-normal"
                    >
                      {TIMEZONES.find((tz) => tz.value === timezone)?.label ?? 'Select timezone...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0">
                    <Command>
                      <CommandInput placeholder="Search timezone..." />
                      <CommandList>
                        <CommandEmpty>No timezone found.</CommandEmpty>
                        <CommandGroup>
                          {TIMEZONES.map((tz) => (
                            <CommandItem
                              key={tz.value}
                              value={tz.label}
                              onSelect={() => {
                                setTimezone(tz.value)
                                setTimezoneOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  timezone === tz.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {tz.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="recipient-timezone"
            checked={useRecipientTimezone}
            onCheckedChange={(checked) => setUseRecipientTimezone(checked as boolean)}
            className="mt-0"
          />
          <div className="space-y-1 leading-none">
            <label
              htmlFor="recipient-timezone"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Send in recipient&apos;s timezone
            </label>
            <p className="text-sm text-muted-foreground">
              Each recipient receives the email at the selected time in their local timezone
            </p>
          </div>
        </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-lg font-semibold">Footer options</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">The footer appears at the bottom of your email. It typically includes unsubscribe links and company info required by email regulations.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="custom-footer"
            checked={useCustomFooter}
            onCheckedChange={(checked) => setUseCustomFooter(checked as boolean)}
            className="mt-0"
          />
          <div className="space-y-1 leading-none">
            <label
              htmlFor="custom-footer"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Use custom footer
            </label>
            <p className="text-sm text-muted-foreground">
              {useCustomFooter
                ? 'Uses your saved footer from Klaviyo. Disable to use a simple unsubscribe link instead.'
                : 'Uses a simple unsubscribe link. Enable to use your saved Klaviyo footer.'}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">How to publish</h3>

        <Tabs
          value={publishOption}
          onValueChange={(value) => setPublishOption(value as 'draft' | 'schedule')}
          className="space-y-3"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="draft">Save as draft</TabsTrigger>
            <TabsTrigger value="schedule">Schedule now</TabsTrigger>
          </TabsList>
          <TabsContent value="draft" className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Save as draft</p>
            <p className="text-xs text-muted-foreground">Review and schedule manually in Klaviyo</p>
          </TabsContent>
          <TabsContent value="schedule" className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Schedule immediately</p>
            <p className="text-xs text-muted-foreground">Schedule the campaign for the selected date and time</p>
          </TabsContent>
        </Tabs>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={saving}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1"
        >
          {saving
            ? 'Processing...'
            : publishOption === 'draft'
              ? 'Save Draft to Klaviyo'
              : 'Schedule Campaign'
          }
        </Button>
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
