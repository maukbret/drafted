'use client'

import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, ChevronLeft, Loader2, AlertTriangle, Mail, ExternalLink } from 'lucide-react'

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

interface FooterSetupProps {
  connectionId: string
  hasFooter: boolean
  onComplete: () => void
  onCancel: () => void
  isPostOAuth?: boolean
  onSkip?: () => void
}

export function FooterSetup({ connectionId, hasFooter, onComplete, onCancel, isPostOAuth = false, onSkip }: FooterSetupProps) {
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
  const [headCss, setHeadCss] = useState('')

  // Fetch campaigns on mount
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
      setHeadCss(data.headCss || '')
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
      setHeadCss(data.headCss || '')
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
          footerCss: headCss || undefined,
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

  const getDialogTitle = () => {
    if (step === 'campaigns') return hasFooter ? 'Update Footer' : 'Set Up Footer'
    if (step === 'manual') return hasFooter ? 'Update Footer' : 'Set Up Footer'
    if (step === 'select') return 'Select Footer Sections'
    return 'Confirm Footer'
  }

  const getDialogDescription = () => {
    if (step === 'campaigns') return 'Select a recent campaign to extract your footer from'
    if (step === 'manual') return 'Paste a Klaviyo campaign URL to extract your footer'
    if (step === 'select') return 'Select the sections that make up your footer'
    return 'Is this the correct footer?'
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-visible py-4">
          {isPostOAuth && step === 'campaigns' && (
            <div className="mb-4 p-3 border border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Footer setup recommended</p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  Without a footer, your emails may have deliverability issues. Klaviyo requires unsubscribe links and a physical address in every email.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step: Campaign Picker */}
          {step === 'campaigns' && (
            <div className="space-y-4">
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading campaigns...</span>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-12 space-y-3">
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
                  <ScrollArea className="h-[400px] w-full">
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
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="preview-url">Campaign URL</Label>
                <Input
                  id="preview-url"
                  type="text"
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  placeholder="https://www.klaviyo.com/campaign/..."
                />
                <p className="text-xs text-muted-foreground">
                  Paste any Klaviyo campaign URL that contains your footer
                </p>
              </div>

              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">How to get the campaign URL:</h3>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Go to Klaviyo Campaigns</li>
                    <li>Open any campaign that has your footer</li>
                    <li>Copy the URL from your browser address bar</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step: Select Sections */}
          {step === 'select' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Found {sections.length} section{sections.length !== 1 ? 's' : ''} in the email. Select all sections that make up your footer:
              </p>
              <ScrollArea className="h-[400px] w-full">
                <div className="space-y-3 pr-4">
                  {sections.map((section) => {
                    const isSelected = selectedSections.has(section.id)
                    return (
                      <button
                        key={section.id}
                        onClick={() => toggleSection(section)}
                        className={cn(
                          'w-full text-left p-6 border rounded-lg transition-colors',
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
                              style={{ maxHeight: '150px', overflow: 'hidden' }}
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
            <div className="space-y-6">
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
                This footer will be automatically added to all emails exported from this Klaviyo account. Final export width is 600px, and the footer is resized to match if it is larger or smaller.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {(step === 'select' || step === 'confirm' || step === 'manual') && (
              <Button variant="ghost" onClick={goBack}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            {isPostOAuth && step === 'campaigns' && onSkip ? (
              <Button variant="ghost" onClick={onSkip}>
                Skip for now
              </Button>
            ) : (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {step === 'campaigns' && null}
            {step === 'manual' && (
              <Button
                onClick={fetchSectionsFromUrl}
                disabled={loading || !previewUrl.trim()}
              >
                {loading ? 'Fetching...' : 'Fetch Email'}
              </Button>
            )}
            {step === 'select' && (
              <Button
                onClick={proceedToConfirm}
                disabled={selectedSections.size === 0}
              >
                Continue ({selectedSections.size} selected)
              </Button>
            )}
            {step === 'confirm' && (
              <Button
                onClick={saveFooter}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Footer'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
