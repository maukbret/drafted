'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { Loader2, Check, AlertCircle, X, ExternalLink } from 'lucide-react'

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
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-sm-xl">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b">
        <span className="font-medium text-sm">
          {error
            ? 'Error'
            : isComplete
              ? 'Campaign created!'
              : 'Creating campaign...'}
        </span>
        {(isComplete || error) && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="py-3 px-4 space-y-2">
        {error ? (
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-2 text-sm ${
                step.status === 'complete' ? 'text-muted-foreground' : ''
              }`}
            >
              {step.status === 'pending' && (
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/30" />
                </div>
              )}
              {step.status === 'in_progress' && (
                <div className="w-5 h-5 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {step.status === 'complete' && (
                <div className="w-5 h-5 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
              )}
              <span>{step.label}</span>
            </div>
          ))
        )}
      </CardContent>

      {(isComplete || error) && (
        <CardFooter className="py-3 px-4 border-t flex justify-end gap-2">
          {klaviyoUrl && !error && (
            <Button size="sm" asChild>
              <a href={klaviyoUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Klaviyo
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
