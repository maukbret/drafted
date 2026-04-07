'use client'

import { useEffect, useState } from 'react'
import { GenerationStepRow, type GenerationStep, type StepStatus } from '@/components/generation-step-row'
import { ExportSettings } from '@/lib/campaign-export'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ExportStep extends GenerationStep {
  status: StepStatus
}

function buildSteps(asDraft: boolean, isUpdate: boolean): ExportStep[] {
  return [
    {
      id: 'settings',
      label: 'Saving settings',
      description: 'Updating campaign configuration',
      status: 'pending',
    },
    {
      id: 'images',
      label: 'Uploading images',
      description: 'Sending images to Klaviyo',
      status: 'pending',
    },
    {
      id: 'template',
      label: isUpdate ? 'Updating template' : 'Creating template',
      description: 'Building email HTML template',
      status: 'pending',
    },
    {
      id: 'campaign',
      label: isUpdate ? 'Updating campaign' : 'Creating campaign',
      description: 'Configuring campaign in Klaviyo',
      status: 'pending',
    },
    {
      id: 'finalizing',
      label: asDraft ? 'Saving as draft' : 'Scheduling campaign',
      description: asDraft ? 'Saving draft to Klaviyo' : 'Scheduling send in Klaviyo',
      status: 'pending',
    },
  ]
}

interface Step4ExportProps {
  campaignId: string
  settings: ExportSettings
  asDraft: boolean
  isUpdate: boolean
  onComplete: () => void
  onError: () => void
}

export function Step4Export({
  campaignId,
  settings,
  asDraft,
  isUpdate,
  onComplete,
  onError,
}: Step4ExportProps) {
  const [steps, setSteps] = useState<ExportStep[]>(() => buildSteps(asDraft, isUpdate))
  const [error, setError] = useState<string | null>(null)
  /** Shown when Klaviyo must host images and we refused to fall back to temporary storage links */
  const [showKlaviyoHostingHelp, setShowKlaviyoHostingHelp] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    // Reset steps on re-run (strict mode remount)
    setSteps(buildSteps(asDraft, isUpdate))
    setError(null)
    setShowKlaviyoHostingHelp(false)

    async function runExport() {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asDraft, settings }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          let message = 'Failed to start export'
          try { message = JSON.parse(text).error || message } catch { /* ignore */ }
          setError(message)
          return
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        if (!reader) {
          setError('Failed to start export')
          return
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const data = JSON.parse(line)
              handleStreamEvent(data)
            } catch {
              // Skip unparseable lines
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer)
            handleStreamEvent(data)
          } catch {
            // Skip unparseable lines
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError('Campaign export failed. Please try again.')
      }
    }

    function handleStreamEvent(data: {
      step: string
      status?: string
      message?: string
      hint?: string
      klaviyoCampaignId?: string
    }) {
      if (data.step === 'error') {
        setError(data.message || 'An error occurred during export')
        if (data.hint === 'klaviyo_hosting') {
          setShowKlaviyoHostingHelp(true)
        }
        setSteps(prev => {
          const updated = [...prev]
          const activeIdx = updated.findIndex(s => s.status === 'active')
          if (activeIdx >= 0) {
            updated[activeIdx] = { ...updated[activeIdx], status: 'error', description: data.message || 'An error occurred' }
          }
          return updated
        })
        return
      }

      if (data.step === 'done') {
        // Mark all remaining as completed
        setSteps(prev => prev.map(s => ({ ...s, status: 'completed' as StepStatus })))
        setTimeout(() => onComplete(), 1500)
        return
      }

      if (data.status === 'in_progress') {
        setSteps(prev => prev.map(s =>
          s.id === data.step
            ? { ...s, status: 'active' as StepStatus }
            : s.status === 'active'
              ? { ...s, status: 'completed' as StepStatus }
              : s
        ))
      } else if (data.status === 'complete' || data.status === 'skip') {
        setSteps(prev => prev.map(s =>
          s.id === data.step
            ? { ...s, status: 'completed' as StepStatus }
            : s
        ))
      }
    }

    runExport()

    return () => {
      controller.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prevent accidental tab close during export
  useEffect(() => {
    if (error) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center min-h-[calc(100vh-var(--header-height,0px)-10rem)]">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-1 text-center">
            {asDraft ? 'Saving to Klaviyo' : 'Exporting to Klaviyo'}
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {error
              ? showKlaviyoHostingHelp
                ? 'Export stopped so images are only served from Klaviyo—not temporary Drafted links.'
                : 'Something went wrong during export.'
              : 'Please wait while we set up your campaign.'}
          </p>

          <div className="space-y-2">
            {steps.map(step => (
              <GenerationStepRow
                key={step.id}
                step={step}
                status={step.status}
              />
            ))}
          </div>

          {error && (
            <div className="mt-6 space-y-3">
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
              {showKlaviyoHostingHelp && (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground space-y-3">
                  <div>
                    <p className="font-medium text-foreground">How this works</p>
                    <p className="mt-1.5">
                      Each section image is copied into Klaviyo before we create or update your template. If Klaviyo
                      cannot host an image, we cancel the export instead of embedding a Drafted storage URL. That keeps
                      images from breaking in the inbox and avoids runaway traffic on our side.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">What you can do</p>
                    <ul className="mt-1.5 list-disc pl-5 space-y-1.5">
                      <li>
                        Use <span className="text-foreground">Back to settings</span>, then run export again—many
                        Klaviyo issues are temporary.
                      </li>
                      <li>
                        Check <span className="text-foreground">Connections</span> and confirm Klaviyo is still
                        connected (reconnect if the token expired).
                      </li>
                      <li>
                        If the error mentions the footer, edit your footer in Klaviyo so no images use Drafted / Supabase{' '}
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">frame-images</code> links.
                      </li>
                      <li>
                        If it keeps failing, go back to the <span className="text-foreground">Slice</span> step,
                        re-save (you can tweak a slice and continue through the wizard), then export again so images are
                        re-uploaded for Klaviyo to pull.
                      </li>
                    </ul>
                  </div>
                </div>
              )}
              <Button onClick={onError} variant="outline" className="w-full">
                Back to settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
