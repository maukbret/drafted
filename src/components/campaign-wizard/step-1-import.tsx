'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { cn } from '@/lib/utils'
import { Loader2, Link as LinkIcon, Check, ChevronsUpDown, Zap } from 'lucide-react'
import { toast } from 'sonner'

interface KlaviyoConnection {
  id: string
  account_name: string | null
  owner_name?: string
}

interface Step1ImportProps {
  klaviyoConnections: KlaviyoConnection[]
  teamConnections?: KlaviyoConnection[]
  hasFigmaConnection: boolean
  campaignId: string
  initialConnectionId?: string
  initialFigmaUrl?: string
  onComplete: (data: { connectionId: string; figmaUrl: string }) => void
}

export function Step1Import({
  klaviyoConnections,
  teamConnections = [],
  hasFigmaConnection,
  campaignId,
  initialConnectionId,
  initialFigmaUrl,
  onComplete,
}: Step1ImportProps) {
  const allConnections = [...klaviyoConnections, ...teamConnections]
  const [connectionId, setConnectionId] = useState(initialConnectionId || klaviyoConnections[0]?.id || teamConnections[0]?.id || '')
  const [connectionOpen, setConnectionOpen] = useState(false)
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

  const showStreamErrorToast = (data: Record<string, unknown>) => {
    const message = typeof data?.message === 'string' ? data.message : 'An error occurred'

    if (data?.code === 'figma_rate_limited') {
      const description = typeof data?.retryAt === 'string'
        ? `Try again after ${new Date(data.retryAt).toLocaleString()}.`
        : undefined
      const upgradeUrl = typeof data?.upgradeUrl === 'string' ? data.upgradeUrl : ''

      toast.error(message, {
        description,
        action: upgradeUrl
          ? {
              label: 'Upgrade options',
              onClick: () => window.open(upgradeUrl, '_blank'),
            }
          : undefined,
      })
      return
    }

    toast.error(message)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connectionId) {
      const message = 'Please select a Klaviyo account'
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
    setError(null)
    setProgress('Starting import...')
    let streamErrorToastShown = false

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/process-figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl }),
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
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const data = JSON.parse(line)

            if (data.type === 'progress') {
              setProgress(data.message)
            } else if (data.type === 'warning') {
              if (typeof data.message === 'string') {
                toast.warning(data.message)
              }
            } else if (data.type === 'error') {
              streamErrorToastShown = true
              showStreamErrorToast(data)
              throw new Error(typeof data.message === 'string' ? data.message : 'An error occurred')
            } else if (data.type === 'done') {
              setProgress(null)
              onComplete({ connectionId, figmaUrl })
              return
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer)
          if (data.type === 'warning') {
            if (typeof data.message === 'string') {
              toast.warning(data.message)
            }
          } else if (data.type === 'error') {
            streamErrorToastShown = true
            showStreamErrorToast(data)
            throw new Error(typeof data.message === 'string' ? data.message : 'An error occurred')
          } else if (data.type === 'done') {
            setProgress(null)
            onComplete({ connectionId, figmaUrl })
            return
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
            throw e
          }
        }
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      if (!streamErrorToastShown) {
        toast.error(message)
      }
      setProgress(null)
    } finally {
      setLoading(false)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="klaviyo-account">Klaviyo account</Label>
        <Popover open={connectionOpen} onOpenChange={setConnectionOpen}>
          <PopoverTrigger asChild>
            <Button
              id="klaviyo-account"
              variant="outline"
              role="combobox"
              aria-expanded={connectionOpen}
              disabled={loading}
              className="w-full justify-between font-normal"
            >
              {connectionId
                ? (() => {
                    const conn = allConnections.find((c) => c.id === connectionId)
                    if (!conn) return 'Select a Klaviyo account'
                    const name = conn.account_name || 'Unnamed account'
                    return conn.owner_name ? `${name} (${conn.owner_name})` : name
                  })()
                : 'Select a Klaviyo account'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
            <Command>
              <CommandInput placeholder="Search accounts..." />
              <CommandList>
                <CommandEmpty>No account found.</CommandEmpty>
                {klaviyoConnections.length > 0 && (
                  <CommandGroup heading={teamConnections.length > 0 ? "Your accounts" : undefined}>
                    {klaviyoConnections.map((conn) => (
                      <CommandItem
                        key={conn.id}
                        value={conn.account_name || 'Unnamed account'}
                        onSelect={() => {
                          setConnectionId(conn.id)
                          setConnectionOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            connectionId === conn.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {conn.account_name || 'Unnamed account'}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {teamConnections.length > 0 && (
                  <CommandGroup heading="Team accounts">
                    {teamConnections.map((conn) => (
                      <CommandItem
                        key={conn.id}
                        value={`${conn.account_name || 'Unnamed account'} ${conn.owner_name || ''}`}
                        onSelect={() => {
                          setConnectionId(conn.id)
                          setConnectionOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            connectionId === conn.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span>{conn.account_name || 'Unnamed account'}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({conn.owner_name || 'Team'})
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Select which Klaviyo account to use for this campaign
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="figma-url">Figma URL</Label>
        <Input
          id="figma-url"
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
          {loading ? 'Processing...' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
