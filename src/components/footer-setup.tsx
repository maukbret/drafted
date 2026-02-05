'use client'

import { useState, useMemo } from 'react'
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
import { Check, ChevronLeft } from 'lucide-react'

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

  // Sanitize HTML to prevent XSS attacks
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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'input' && (hasFooter ? 'Update Footer' : 'Setup Footer')}
            {step === 'select' && 'Select Footer Sections'}
            {step === 'confirm' && 'Confirm Footer'}
          </DialogTitle>
          <DialogDescription>
            {step === 'input' && 'Paste a Klaviyo campaign URL to extract your footer'}
            {step === 'select' && 'Select the sections that make up your footer'}
            {step === 'confirm' && 'Is this the correct footer?'}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-visible py-4">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Input URL */}
          {step === 'input' && (
            <div className="space-y-4">
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
                <CardContent className="p-4">
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

          {/* Step 2: Select Section */}
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found {sections.length} section{sections.length !== 1 ? 's' : ''} in the email. Select all sections that make up your footer:
              </p>
              <ScrollArea className="max-h-[400px]">
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
                            <p className="text-sm text-muted-foreground line-clamp-2">
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

          {/* Step 3: Confirm */}
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
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {(step === 'select' || step === 'confirm') && (
              <Button variant="ghost" onClick={goBack}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {step === 'input' && (
              <Button
                onClick={fetchSections}
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
