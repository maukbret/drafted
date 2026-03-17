'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronsUpDown, Eye, HelpCircle } from 'lucide-react'
import { AudienceSelector } from '../audience-selector'
import { CampaignPreviewSheet } from './campaign-preview-sheet'
import type { ProductFeedPreviewData } from './campaign-email-preview'
import { startCampaignExport } from '@/lib/campaign-export'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface Step3SettingsProps {
  campaignId: string
  connectionId: string
  frames: Frame[]
  initialName: string
  initialSubjectLine: string
  initialPreviewText: string
  initialIncludedAudiences: KlaviyoAudience[]
  initialExcludedAudiences: KlaviyoAudience[]
  initialScheduledAt: string | null
  initialUseRecipientTimezone: boolean
  initialUtmSettings?: {
    enabled: boolean
    source: string
    medium: string
    campaign: string
    content: string
    term: string
  } | null
  initialProductFeedSettings?: { feedName: string; productCount: number } | null
  isUpdate: boolean
  onConceptDraftChange?: (updates: Record<string, unknown>) => void
  onComplete: () => void
  onBack: () => void
}

interface DefaultAudiencePreset {
  includedAudiences: KlaviyoAudience[]
  excludedAudiences: KlaviyoAudience[]
}

interface Frame {
  id: string
  name: string
  width: number | null
  image_url: string | null
  link_url: string | null
}

interface DefaultAudienceResponse {
  defaultAudience: DefaultAudiencePreset | null
  error?: string
}

interface FooterResponse {
  footer?: {
    footer_html?: string | null
  } | null
  error?: string
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

function getTimezoneOffsetString(timezone: string, date: Date): string {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = tzDate.getTime() - utcDate.getTime()
  const offsetMinutes = offsetMs / 60000
  const hours = Math.floor(Math.abs(offsetMinutes) / 60)
  const minutes = Math.abs(offsetMinutes) % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function buildScheduledAtValue(
  scheduledDate: string,
  scheduledTime: string,
  timezone: string,
  useRecipientTimezone: boolean
): string | null {
  if (!scheduledDate || !scheduledTime) return null

  if (useRecipientTimezone) {
    return `${scheduledDate}T${scheduledTime}:00`
  }

  const dateForOffset = new Date(`${scheduledDate}T${scheduledTime}:00Z`)
  const offset = getTimezoneOffsetString(timezone, dateForOffset)
  return `${scheduledDate}T${scheduledTime}:00${offset}`
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
  frames,
  initialName,
  initialSubjectLine,
  initialPreviewText,
  initialIncludedAudiences,
  initialExcludedAudiences,
  initialScheduledAt,
  initialUseRecipientTimezone,
  initialUtmSettings,
  initialProductFeedSettings,
  isUpdate,
  onConceptDraftChange,
  onComplete,
  onBack,
}: Step3SettingsProps) {
  const parsedSchedule = parseScheduledAt(initialScheduledAt)
  const [name, setName] = useState(initialName)
  const [subjectLine, setSubjectLine] = useState(initialSubjectLine)
  const [previewText, setPreviewText] = useState(initialPreviewText || '')
  const [includedAudiences, setIncludedAudiences] = useState<KlaviyoAudience[]>(initialIncludedAudiences || [])
  const [excludedAudiences, setExcludedAudiences] = useState<KlaviyoAudience[]>(initialExcludedAudiences || [])
  const [defaultAudience, setDefaultAudience] = useState<DefaultAudiencePreset | null>(null)
  const [loadingDefaultAudience, setLoadingDefaultAudience] = useState(true)
  const [applyingDefaultAudience, setApplyingDefaultAudience] = useState(false)
  const [defaultAudienceError, setDefaultAudienceError] = useState<string | null>(null)
  const [defaultAudienceWarning, setDefaultAudienceWarning] = useState<string | null>(null)
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
  const [useRecipientTimezone, setUseRecipientTimezone] = useState(initialUseRecipientTimezone)
  const [publishOption, setPublishOption] = useState<'draft' | 'schedule'>('draft')
  const [useCustomFooter, setUseCustomFooter] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewFooterHtml, setPreviewFooterHtml] = useState<string | null>(null)
  const [previewFooterLoading, setPreviewFooterLoading] = useState(false)
  const [previewFooterError, setPreviewFooterError] = useState<string | null>(null)
  const [utmEnabled, setUtmEnabled] = useState(initialUtmSettings?.enabled ?? false)
  const [utmSource, setUtmSource] = useState(initialUtmSettings?.source ?? 'klaviyo')
  const [utmMedium, setUtmMedium] = useState(initialUtmSettings?.medium ?? 'email')
  const [utmCampaign, setUtmCampaign] = useState(initialUtmSettings?.campaign ?? '')
  const [utmContent, setUtmContent] = useState(initialUtmSettings?.content ?? '')
  const [utmTerm, setUtmTerm] = useState(initialUtmSettings?.term ?? '')
  const [utmOpen, setUtmOpen] = useState(initialUtmSettings?.enabled ?? false)
  const [productFeedPreview, setProductFeedPreview] = useState<ProductFeedPreviewData | null>(null)

  useEffect(() => {
    if (!onConceptDraftChange) return

    onConceptDraftChange({
      name: name.trim(),
      subject_line: subjectLine.trim(),
      preview_text: previewText.trim() || null,
      included_audiences: includedAudiences,
      excluded_audiences: excludedAudiences,
      scheduled_at: buildScheduledAtValue(scheduledDate, scheduledTime, timezone, useRecipientTimezone),
      send_in_recipient_timezone: useRecipientTimezone,
    })
  }, [
    excludedAudiences,
    includedAudiences,
    name,
    onConceptDraftChange,
    previewText,
    scheduledDate,
    scheduledTime,
    subjectLine,
    timezone,
    useRecipientTimezone,
  ])

  useEffect(() => {
    let isActive = true

    const fetchDefaultAudience = async () => {
      setLoadingDefaultAudience(true)
      setDefaultAudienceError(null)
      setDefaultAudienceWarning(null)

      try {
        const response = await fetch(`/api/klaviyo/default-audience?connectionId=${connectionId}`)

        if (!response.ok) {
          let message = 'Failed to load default audience'
          try { const data = await response.json(); message = data.error || message } catch {}
          throw new Error(message)
        }

        const data: DefaultAudienceResponse = await response.json()

        if (!isActive) return
        setDefaultAudience(data.defaultAudience || null)
      } catch (err) {
        if (!isActive) return
        setDefaultAudience(null)
        setDefaultAudienceError(err instanceof Error ? err.message : 'Failed to load default audience')
      } finally {
        if (!isActive) return
        setLoadingDefaultAudience(false)
      }
    }

    if (connectionId) {
      fetchDefaultAudience()
    } else {
      setDefaultAudience(null)
      setLoadingDefaultAudience(false)
    }

    return () => {
      isActive = false
    }
  }, [connectionId])

  useEffect(() => {
    if (!isPreviewOpen || !useCustomFooter || !connectionId) {
      return
    }

    let isActive = true

    const fetchPreviewFooter = async () => {
      setPreviewFooterLoading(true)
      setPreviewFooterError(null)

      try {
        const response = await fetch(`/api/klaviyo/footer?connectionId=${connectionId}`)
        const data: FooterResponse = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load footer')
        }

        if (!isActive) return
        setPreviewFooterHtml(data.footer?.footer_html || null)
      } catch (err) {
        if (!isActive) return
        setPreviewFooterHtml(null)
        setPreviewFooterError(err instanceof Error ? err.message : 'Failed to load footer')
      } finally {
        if (!isActive) return
        setPreviewFooterLoading(false)
      }
    }

    fetchPreviewFooter()

    return () => {
      isActive = false
    }
  }, [connectionId, isPreviewOpen, useCustomFooter])

  useEffect(() => {
    if (!isPreviewOpen || !initialProductFeedSettings?.feedName || !connectionId) {
      return
    }

    let isActive = true

    const fetchProductFeedPreset = async () => {
      try {
        const response = await fetch(`/api/klaviyo/product-feed-preset?connectionId=${connectionId}`)
        if (!response.ok) return

        const data = await response.json()

        if (!isActive) return

        if (data.preset) {
          setProductFeedPreview({
            layout: data.preset.layout,
            buttonColor: data.preset.button_color,
            buttonTextColor: data.preset.button_text_color,
            buttonText: data.preset.button_text,
            showPrice: data.preset.show_price,
            showTitle: data.preset.show_title,
            imageRatio: data.preset.image_ratio,
            productCount: initialProductFeedSettings.productCount,
            feedName: initialProductFeedSettings.feedName,
          })
        }
      } catch {
        if (isActive) setProductFeedPreview(null)
      }
    }

    fetchProductFeedPreset()

    return () => {
      isActive = false
    }
  }, [connectionId, isPreviewOpen, initialProductFeedSettings])

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

  const handleSubmit = () => {
    if (!validateForm()) return

    if (!scheduledDate || !scheduledTime) {
      setError('Please select a date and time')
      return
    }

    setSaving(true)
    setError(null)

    const asDraft = publishOption === 'draft'

    // Fire and forget - export continues in background via sonner toasts
    startCampaignExport(
      campaignId,
      {
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
        utmEnabled,
        utmSource,
        utmMedium,
        utmCampaign: utmCampaign || name.trim(),
        utmContent,
        utmTerm,
      },
      asDraft,
      isUpdate,
    )

    // Navigate back to campaigns immediately
    onComplete()
  }

  const handleApplyDefaultAudience = async () => {
    if (!defaultAudience || applyingDefaultAudience) {
      return
    }

    setApplyingDefaultAudience(true)
    setDefaultAudienceError(null)
    setDefaultAudienceWarning(null)

    try {
      const response = await fetch(`/api/klaviyo/audiences?connectionId=${connectionId}`)

      if (!response.ok) {
        let message = 'Failed to load current audiences'
        try { const data = await response.json(); message = data.error || message } catch {}
        throw new Error(message)
      }

      const data = await response.json()
      const availableAudiences = (data.audiences || []) as KlaviyoAudience[]
      const audiencesById = new Map(
        availableAudiences.map((audience) => [audience.id, audience])
      )

      const resolveAudiences = (audiences: KlaviyoAudience[]) => (
        audiences
          .map((audience) => audiencesById.get(audience.id))
          .filter((audience): audience is KlaviyoAudience => !!audience)
      )

      const validIncludedAudiences = resolveAudiences(defaultAudience.includedAudiences)
      const validExcludedAudiences = resolveAudiences(defaultAudience.excludedAudiences)
      const missingCount =
        (defaultAudience.includedAudiences.length - validIncludedAudiences.length) +
        (defaultAudience.excludedAudiences.length - validExcludedAudiences.length)

      // Apply replaces the current audience selection.
      setIncludedAudiences(validIncludedAudiences)
      setExcludedAudiences(validExcludedAudiences)

      if (missingCount > 0) {
        setDefaultAudienceWarning(
          `${missingCount} audience${missingCount === 1 ? '' : 's'} in this default no longer exist in Klaviyo. We applied the remaining audiences.`
        )
      }
    } catch (err) {
      setDefaultAudienceError(err instanceof Error ? err.message : 'Failed to apply default audience')
    } finally {
      setApplyingDefaultAudience(false)
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
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Default audience preset</p>
                <p className="text-xs text-muted-foreground">
                  {loadingDefaultAudience
                    ? 'Loading default audience...'
                    : defaultAudience
                      ? `${defaultAudience.includedAudiences.length} include · ${defaultAudience.excludedAudiences.length} exclude`
                      : 'No default audience is set for this account. Set one from Connections.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplyDefaultAudience}
                disabled={saving || loadingDefaultAudience || !defaultAudience || applyingDefaultAudience}
                className="rounded-full"
              >
                {applyingDefaultAudience ? 'Applying...' : 'Apply default audience'}
              </Button>
            </div>
          </div>

          {defaultAudienceError && (
            <div className="p-3 border border-destructive/20 bg-destructive/10 rounded-lg">
              <p className="text-sm text-destructive">{defaultAudienceError}</p>
            </div>
          )}

          {defaultAudienceWarning && (
            <div className="p-3 border border-amber-500/40 bg-amber-500/10 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">{defaultAudienceWarning}</p>
            </div>
          )}

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
                ? 'Uses your saved footer from Klaviyo. Final export width is 600px, and the footer is automatically resized to match. Disable to use a simple unsubscribe link instead.'
                : 'Uses a simple unsubscribe link. Enable to use your saved Klaviyo footer (auto-resized to the 600px export width).'}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <Collapsible open={utmOpen} onOpenChange={setUtmOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold">UTM tracking</h3>
              {utmEnabled && !utmOpen && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">On</span>
              )}
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              utmOpen && "rotate-180"
            )} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="utm-enabled"
                checked={utmEnabled}
                onCheckedChange={(checked) => setUtmEnabled(checked as boolean)}
                className="mt-0"
              />
              <div className="space-y-1 leading-none">
                <label
                  htmlFor="utm-enabled"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Add UTM parameters to links
                </label>
                <p className="text-sm text-muted-foreground">
                  Klaviyo will automatically append UTM parameters to all links in your email
                </p>
              </div>
            </div>

            {utmEnabled && (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="utm-source" className="text-xs text-muted-foreground">Source</Label>
                    <Input
                      id="utm-source"
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      placeholder="e.g. klaviyo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="utm-medium" className="text-xs text-muted-foreground">Medium</Label>
                    <Input
                      id="utm-medium"
                      value={utmMedium}
                      onChange={(e) => setUtmMedium(e.target.value)}
                      placeholder="e.g. email"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="utm-campaign" className="text-xs text-muted-foreground">
                    Campaign <span className="text-muted-foreground/60">(defaults to campaign name)</span>
                  </Label>
                  <Input
                    id="utm-campaign"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder={name || 'Campaign name'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="utm-content" className="text-xs text-muted-foreground">Content <span className="text-muted-foreground/60">(optional)</span></Label>
                    <Input
                      id="utm-content"
                      value={utmContent}
                      onChange={(e) => setUtmContent(e.target.value)}
                      placeholder="e.g. header-banner"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="utm-term" className="text-xs text-muted-foreground">Term <span className="text-muted-foreground/60">(optional)</span></Label>
                    <Input
                      id="utm-term"
                      value={utmTerm}
                      onChange={(e) => setUtmTerm(e.target.value)}
                      placeholder="e.g. spring-sale"
                    />
                  </div>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
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
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsPreviewOpen(true)}
          disabled={saving}
        >
          <Eye className="h-4 w-4 mr-2" />
          Preview email
        </Button>
      </div>

      <CampaignPreviewSheet
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        subjectLine={subjectLine}
        previewText={previewText}
        frames={frames}
        useCustomFooter={useCustomFooter}
        footerHtml={previewFooterHtml}
        footerLoading={previewFooterLoading}
        footerError={previewFooterError}
        productFeedPreview={productFeedPreview}
      />
    </div>
  )
}
