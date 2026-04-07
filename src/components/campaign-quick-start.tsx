'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  KlaviyoAccountCombobox,
  type KlaviyoAccountOption,
} from '@/components/klaviyo-account-combobox'
import { Loader2, Link as LinkIcon, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  consumeProcessFigmaStream,
  ProcessFigmaStreamError,
} from '@/lib/process-figma-stream-client'
import { cn } from '@/lib/utils'

export interface CampaignQuickStartProps {
  klaviyoConnections: KlaviyoAccountOption[]
  teamConnections: KlaviyoAccountOption[]
  hasFigmaConnection: boolean
  hasKlaviyoConnection: boolean
  defaultKlaviyoConnectionId: string | null
}

export function CampaignQuickStart({
  klaviyoConnections,
  teamConnections,
  hasFigmaConnection,
  hasKlaviyoConnection,
  defaultKlaviyoConnectionId,
}: CampaignQuickStartProps) {
  const router = useRouter()

  const [connectionId, setConnectionId] = React.useState(() => {
    const idSet = new Set([
      ...klaviyoConnections.map((c) => c.id),
      ...teamConnections.map((c) => c.id),
    ])
    if (defaultKlaviyoConnectionId && idSet.has(defaultKlaviyoConnectionId)) {
      return defaultKlaviyoConnectionId
    }
    return klaviyoConnections[0]?.id || teamConnections[0]?.id || ''
  })
  const [figmaUrl, setFigmaUrl] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [progress, setProgress] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hasFigmaConnection || !hasKlaviyoConnection) return

    if (!connectionId) {
      toast.error('Please select a Klaviyo account')
      return
    }
    if (!figmaUrl.trim()) {
      toast.error('Please enter a Figma URL')
      return
    }

    setLoading(true)
    setProgress('Creating campaign...')

    let campaignId: string | null = null

    try {
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klaviyoConnectionId: connectionId }),
      })

      let payload: { campaign?: { id: string }; error?: string; code?: string } | null = null
      try {
        payload = await createRes.json()
      } catch {
        payload = null
      }

      if (!createRes.ok || !payload?.campaign?.id) {
        if (payload?.code === 'missing_figma_connection' || payload?.code === 'missing_klaviyo_connection') {
          router.push('/connections')
          return
        }
        throw new Error(payload?.error || 'Failed to create campaign')
      }

      campaignId = payload.campaign.id
      setProgress('Starting import...')

      const processRes = await fetch(`/api/campaigns/${campaignId}/process-figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl: figmaUrl.trim() }),
      })

      await consumeProcessFigmaStream(processRes, (msg) => setProgress(msg ?? null))

      const patchRes = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          klaviyo_connection_id: connectionId,
          slice_mode: true,
          wizard_step: 2,
        }),
      })

      if (!patchRes.ok) {
        throw new Error('Failed to update campaign after import')
      }

      setProgress(null)
      router.push(`/campaigns/${campaignId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      const already =
        err instanceof ProcessFigmaStreamError ? err.toastAlreadyShown : false
      if (!already) {
        toast.error(message)
      }
      if (campaignId) {
        toast.message('You can continue from the draft', {
          description: 'Open the campaign to retry import or edit.',
          action: {
            label: 'Open',
            onClick: () => router.push(`/campaigns/${campaignId}`),
          },
        })
      }
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }

  if (!hasFigmaConnection) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <LinkIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Connect Figma</p>
              <p className="text-sm text-muted-foreground">
                Connect your Figma account to paste a frame URL and start a campaign.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/connections">Go to Connections</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!hasKlaviyoConnection) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <LinkIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Connect Klaviyo</p>
              <p className="text-sm text-muted-foreground">
                Connect a Klaviyo account to create campaigns.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/connections">Go to Connections</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="quick-figma-url" className="text-xs font-medium text-muted-foreground">
            Figma URL
          </label>
          <Input
            id="quick-figma-url"
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/..."
            disabled={loading}
            className="w-full"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-[min(280px,100%)] sm:shrink-0">
          <span className="block text-xs font-medium text-muted-foreground">Klaviyo account</span>
          <KlaviyoAccountCombobox
            id="quick-klaviyo-account"
            klaviyoConnections={klaviyoConnections}
            teamConnections={teamConnections}
            value={connectionId}
            onChange={setConnectionId}
            disabled={loading}
            triggerClassName="w-full"
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !connectionId || !figmaUrl.trim()}
          className={cn('w-full shrink-0 sm:w-auto sm:min-w-[160px]')}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4 buttonIcon" />
              Create campaign
            </span>
          )}
        </Button>
      </div>
      {progress && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {progress}
        </p>
      )}
    </form>
  )
}
