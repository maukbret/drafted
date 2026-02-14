'use client'

import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, ChevronLeft, Loader2, Mail, ExternalLink } from 'lucide-react'

interface EmailSection {
  id: string
  html: string
  preview: string
  index: number
}

interface KlaviyoCampaign {
  id: string
  name: string
  subject: string | null
  status: string
  sentAt: string | null
  createdAt: string | null
}

interface FooterSetupInlineProps {
  connectionId: string
  hasFooter: boolean
  onComplete: () => void
  onSkip: () => void
  className?: string
}

export function FooterSetupInline({ connectionId, hasFooter, onComplete, onSkip, className }: FooterSetupInlineProps) {
  const [step, setStep] = useState<'campaigns' | 'manual' | 'select' | 'confirm'>('campaigns')
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sections, setSections] = useState<EmailSection[]>([])
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<KlaviyoCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')

  useEffect(() => {
    const fetchCampaigns = async () => {
      setCampaignsLoading(true)
      try {
        const response = await fetch(`/api/klaviyo/campaigns?connectionId=${connectionId}`)
        if (response.ok) {
          const data = await response.json()
          setCampaigns(data.campaigns || [])
        }
      } catch (err) {
        console.error('Failed to fetch campaigns:', err)
      } finally {
        setCampaignsLoading(false)
      }
    }

    fetchCampaigns()
  }, [connectionId])

  const fetchSectionsFromCampaign = async (campaignId: string) => {
    setSelectedCampaignId(campaignId)
    setLoading(true)
    setError(null)

    const syntheticUrl = `https://www.klaviyo.com/campaign/${campaignId}`
    setSourceUrl(syntheticUrl)

    try {
      const response = await fetch('/api/klaviyo/footer/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewUrl: syntheticUrl, connectionId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch campaign content')
      }

      if (!data.sections || data.sections.length === 0) {
        throw new Error('No sections found in this campaign. Try another campaign or enter a URL manually.')
      }

      setSections(data.sections)
      setStep('select')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch campaign content')
      setSelectedCampaignId(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchSectionsFromUrl = async () => {
    if (!previewUrl.trim()) {
      setError('Please enter a campaign URL')
      return
    }

    setLoading(true)
    setError(null)
    setSourceUrl(previewUrl.trim())

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

  const getSelectedSectionsOrdered = () => {
    return sections
      .filter(s => selectedSections.has(s.id))
      .sort((a, b) => a.index - b.index)
  }

  const getCombinedHtml = () => {
    return getSelectedSectionsOrdered()
      .map(s => s.html)
      .join('\n')
  }

  const sanitizeHtml = (html: string) => {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'rel'],
    })
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
          sourceUrl,
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
    setError(null)
    if (step === 'confirm') {
      setStep('select')
    } else if (step === 'select') {
      setSections([])
      setSelectedSections(new Set())
      setSelectedCampaignId(null)
      if (previewUrl) {
        setStep('manual')
      } else {
        setStep('campaigns')
      }
    } else if (step === 'manual') {
      setStep('campaigns')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return null
    }
  }

  const getTitle = () => {
    if (step === 'campaigns') return hasFooter ? 'Update Footer' : 'Set Up Footer'
    if (step === 'manual') return hasFooter ? 'Update Footer' : 'Set Up Footer'
    if (step === 'select') return 'Select Footer Sections'
    return 'Confirm Footer'
  }

  const getDescription = () => {
    if (step === 'campaigns') return 'Select a recent campaign to extract your footer from'
    if (step === 'manual') return 'Paste a Klaviyo campaign URL to extract your footer'
    if (step === 'select') return 'Select the sections that make up your footer'
    return 'Is this the correct footer?'
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-semibold">{getTitle()}</h3>
        <p className="text-sm text-muted-foreground">{getDescription()}</p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step: Campaign Picker */}
      {step === 'campaigns' && (
        <div className="space-y-4">
          {campaignsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading campaigns...</span>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Mail className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No sent campaigns found in this Klaviyo account.
              </p>
              <Button variant="link" onClick={() => setStep('manual')}>
                Enter a campaign URL manually
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="h-[300px] w-full">
                <div className="space-y-2 pr-4">
                  {campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      onClick={() => fetchSectionsFromCampaign(campaign.id)}
                      disabled={loading}
                      className={cn(
                        'w-full text-left p-4 border rounded-lg transition-colors',
                        selectedCampaignId === campaign.id && loading
                          ? 'border-primary bg-muted'
                          : 'border-border hover:border-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{campaign.name}</p>
                          {campaign.subject && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                              {campaign.subject}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {campaign.sentAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(campaign.sentAt)}
                            </span>
                          )}
                          {selectedCampaignId === campaign.id && loading && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <div className="text-center">
                <Button variant="link" size="sm" onClick={() => setStep('manual')}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Can&apos;t find your campaign? Enter URL manually
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step: Manual URL Input */}
      {step === 'manual' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inline-preview-url">Campaign URL</Label>
            <Input
              id="inline-preview-url"
              type="text"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              placeholder="https://www.klaviyo.com/campaign/..."
            />
            <p className="text-xs text-muted-foreground">
              Paste any Klaviyo campaign URL that contains your footer
            </p>
          </div>
        </div>
      )}

      {/* Step: Select Sections */}
      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Found {sections.length} section{sections.length !== 1 ? 's' : ''} in the email. Select all sections that make up your footer:
          </p>
          <ScrollArea className="h-[300px] w-full">
            <div className="space-y-3 pr-4">
              {sections.map((section) => {
                const isSelected = selectedSections.has(section.id)
                return (
                  <button
                    key={section.id}
                    onClick={() => toggleSection(section)}
                    className={cn(
                      'w-full text-left p-4 border rounded-lg transition-colors',
                      isSelected
                        ? 'border-primary bg-muted'
                        : 'border-border hover:border-muted-foreground'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/30'
                      )}>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary-foreground" />
                        )}
                      </div>
                      <span className="flex-shrink-0 w-8 h-8 bg-muted rounded-full flex items-center justify-center text-sm font-medium">
                        {section.index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {section.preview || '(No text content)'}
                        </p>
                        <div
                          className="mt-2 border rounded overflow-hidden bg-white"
                          style={{ maxHeight: '120px', overflow: 'hidden' }}
                        >
                          <div
                            className="transform scale-50 origin-top-left"
                            style={{ width: '200%' }}
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedSections.size > 0 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm font-medium">
                Preview of selected footer ({selectedSections.size} section{selectedSections.size !== 1 ? 's' : ''}):
              </p>
            </CardHeader>
            <CardContent className="bg-white rounded-b-lg">
              <div
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(getCombinedHtml()) }}
              />
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            This footer will be automatically added to all emails exported from this Klaviyo account.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-2">
        <div>
          {(step === 'select' || step === 'confirm' || step === 'manual') && (
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          {step === 'campaigns' && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip footer
            </Button>
          )}
          {step === 'manual' && (
            <Button
              onClick={fetchSectionsFromUrl}
              disabled={loading || !previewUrl.trim()}
              size="sm"
            >
              {loading ? 'Fetching...' : 'Fetch Email'}
            </Button>
          )}
          {step === 'select' && (
            <Button
              onClick={proceedToConfirm}
              disabled={selectedSections.size === 0}
              size="sm"
            >
              Continue ({selectedSections.size} selected)
            </Button>
          )}
          {step === 'confirm' && (
            <Button
              onClick={saveFooter}
              disabled={saving}
              size="sm"
            >
              {saving ? 'Saving...' : 'Save Footer'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
