'use client'

import { useState, useEffect, useRef, type MutableRefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  KlaviyoAccountCombobox,
  type KlaviyoAccountOption,
} from '@/components/klaviyo-account-combobox'
import { Loader2, Link as LinkIcon, Plus, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  consumeProcessFigmaStream,
  ProcessFigmaStreamError,
} from '@/lib/process-figma-stream-client'

interface Step1ImportProps {
  klaviyoConnections: KlaviyoAccountOption[]
  teamConnections?: KlaviyoAccountOption[]
  hasFigmaConnection: boolean
  campaignId: string
  initialConnectionId?: string
  initialFigmaUrl?: string
  onComplete: (data: { connectionId: string; figmaUrl: string }) => void
  /** Horizontal “quick start” layout (Figma + account + button in one row on wide screens). */
  layout?: 'stacked' | 'inline'
  /** Hide Klaviyo picker; use {@link initialConnectionId} only (e.g. replace design for an existing campaign). */
  lockKlaviyoAccount?: boolean
  /** Label for the locked account row (e.g. account name). */
  lockedAccountLabel?: string
  submitLabel?: string
  /** When set, each submit assigns a new controller; parent may abort to cancel (e.g. dialog close). */
  abortControllerRef?: MutableRefObject<AbortController | null>
  onBusyChange?: (busy: boolean) => void
  /** When true, Figma is always re-fetched (skips same-URL cached frames). */
  forceRefresh?: boolean
}

export function Step1Import({
  klaviyoConnections,
  teamConnections = [],
  hasFigmaConnection,
  campaignId,
  initialConnectionId,
  initialFigmaUrl,
  onComplete,
  layout = 'stacked',
  lockKlaviyoAccount = false,
  lockedAccountLabel,
  submitLabel,
  abortControllerRef,
  onBusyChange,
  forceRefresh = false,
}: Step1ImportProps) {
  const allConnections = [...klaviyoConnections, ...teamConnections]
  const [connectionId, setConnectionId] = useState(
    initialConnectionId || klaviyoConnections[0]?.id || teamConnections[0]?.id || ''
  )

  useEffect(() => {
    if (lockKlaviyoAccount && initialConnectionId) {
      setConnectionId(initialConnectionId)
    }
  }, [lockKlaviyoAccount, initialConnectionId])
  const [figmaUrl, setFigmaUrl] = useState(initialFigmaUrl || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [existingImport, setExistingImport] = useState<{ projectName: string; importedAt: string } | null>(null)
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if Figma URL was previously imported (debounced)
  useEffect(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    setExistingImport(null)

    const hasNodeId = figmaUrl.includes('node-id=')
    const hasDesignPath = figmaUrl.includes('/design/')
    if (!figmaUrl || !hasNodeId || !hasDesignPath) return

    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/figma/check-import?url=${encodeURIComponent(figmaUrl)}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.exists) {
          setExistingImport({ projectName: data.projectName, importedAt: data.importedAt })
        }
      } catch {
        // Silently ignore — non-critical check
      }
    }, 400)

    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    }
  }, [figmaUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connectionId) {
      const message = lockKlaviyoAccount
        ? 'This campaign has no Klaviyo account'
        : 'Please select a Klaviyo account'
      setError(message)
      toast.error(message)
      return
    }

    if (!figmaUrl) {
      const message = 'Please enter a Figma URL'
      setError(message)
      toast.error(message)
      return
    }

    setLoading(true)
    onBusyChange?.(true)
    setError(null)
    setProgress('Starting import...')

    try {
      let signal: AbortSignal | undefined
      if (abortControllerRef) {
        abortControllerRef.current = new AbortController()
        signal = abortControllerRef.current.signal
      }

      const response = await fetch(`/api/campaigns/${campaignId}/process-figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl, ...(forceRefresh ? { forceRefresh: true } : {}) }),
        ...(signal ? { signal } : {}),
      })

      await consumeProcessFigmaStream(response, (message) => setProgress(message ?? null))
      setProgress(null)
      onComplete({ connectionId, figmaUrl })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setProgress(null)
        return
      }
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      const already =
        err instanceof ProcessFigmaStreamError ? err.toastAlreadyShown : false
      if (!already) {
        toast.error(message)
      }
      setProgress(null)
    } finally {
      setLoading(false)
      onBusyChange?.(false)
    }
  }

  if (!hasFigmaConnection) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
          <LinkIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connect Figma first</h3>
        <p className="text-muted-foreground mb-4">
          You need to connect your Figma account before creating a campaign.
        </p>
        <Button asChild>
          <a href="/connections">Go to Connections</a>
        </Button>
      </div>
    )
  }

  if (allConnections.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
          <LinkIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connect Klaviyo first</h3>
        <p className="text-muted-foreground mb-4">
          You need to connect a Klaviyo account before creating a campaign.
        </p>
        <Button asChild>
          <a href="/connections">Go to Connections</a>
        </Button>
      </div>
    )
  }

  const continueLabel = submitLabel ?? 'Continue'
  const klaviyoRow = lockKlaviyoAccount ? (
    <div className="w-full space-y-1.5 sm:w-[min(280px,100%)] sm:shrink-0">
      <span className="block text-xs font-medium text-muted-foreground">Klaviyo account</span>
      <p className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
        {lockedAccountLabel || '—'}
      </p>
    </div>
  ) : (
    <div className={cn('space-y-2', layout === 'inline' && 'w-full space-y-1.5 sm:w-[min(280px,100%)] sm:shrink-0')}>
      {layout === 'stacked' && <Label htmlFor="klaviyo-account">Klaviyo account</Label>}
      {layout === 'inline' && (
        <span className="block text-xs font-medium text-muted-foreground">Klaviyo account</span>
      )}
      <KlaviyoAccountCombobox
        id={layout === 'inline' ? 'wizard-import-klaviyo-account' : undefined}
        klaviyoConnections={klaviyoConnections}
        teamConnections={teamConnections}
        value={connectionId}
        onChange={setConnectionId}
        disabled={loading}
        triggerClassName={layout === 'inline' ? 'w-full' : undefined}
      />
      {layout === 'stacked' && (
        <p className="text-xs text-muted-foreground">
          Select which Klaviyo account to use for this campaign
        </p>
      )}
    </div>
  )

  const figmaFieldIdStacked = 'figma-url'
  const figmaFieldIdInline = 'wizard-import-figma-url-inline'

  const inlineForm = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={figmaFieldIdInline} className="text-xs font-medium text-muted-foreground">
            Figma URL
          </label>
          <Input
            id={figmaFieldIdInline}
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/..."
            disabled={loading}
            className="w-full"
          />
        </div>
        {klaviyoRow}
        <Button
          type="submit"
          disabled={loading || !connectionId || !figmaUrl}
          className="w-full shrink-0 sm:w-auto sm:min-w-[160px]"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working…
            </span>
          ) : continueLabel === 'Create campaign' ? (
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4 buttonIcon" />
              {continueLabel}
            </span>
          ) : (
            continueLabel
          )}
        </Button>
      </div>
      {existingImport ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Zap className="h-3.5 w-3.5" />
          <span>Previously imported — this will be quick</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Include a node-id in the URL. Import runs while this dialog stays open until you reach the
          slice step.
        </p>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {progress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {progress}
        </div>
      )}
    </form>
  )

  if (layout === 'inline') {
    return inlineForm
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {lockKlaviyoAccount ? (
        <div className="space-y-2">
          <Label>Klaviyo account</Label>
          <p className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
            {lockedAccountLabel || '—'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="klaviyo-account">Klaviyo account</Label>
          <KlaviyoAccountCombobox
            klaviyoConnections={klaviyoConnections}
            teamConnections={teamConnections}
            value={connectionId}
            onChange={setConnectionId}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Select which Klaviyo account to use for this campaign
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={figmaFieldIdStacked}>Figma URL</Label>
        <Input
          id={figmaFieldIdStacked}
          type="url"
          value={figmaUrl}
          onChange={(e) => setFigmaUrl(e.target.value)}
          placeholder="https://www.figma.com/design/..."
          disabled={loading}
        />
        {existingImport ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3.5 w-3.5" />
            <span>Previously imported — this will be quick</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Paste the URL of your Figma frame. Make sure the URL includes a node-id parameter.
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {progress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {progress}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading || !connectionId || !figmaUrl}>
          {loading ? 'Processing...' : continueLabel}
        </Button>
      </div>
    </form>
  )
}
