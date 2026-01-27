'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Link as LinkIcon } from 'lucide-react'

interface KlaviyoConnection {
  id: string
  account_name: string | null
}

interface Step1ImportProps {
  klaviyoConnections: KlaviyoConnection[]
  hasFigmaConnection: boolean
  campaignId: string
  initialConnectionId?: string
  initialFigmaUrl?: string
  onComplete: (data: { connectionId: string; figmaUrl: string }) => void
}

export function Step1Import({
  klaviyoConnections,
  hasFigmaConnection,
  campaignId,
  initialConnectionId,
  initialFigmaUrl,
  onComplete,
}: Step1ImportProps) {
  const [connectionId, setConnectionId] = useState(initialConnectionId || klaviyoConnections[0]?.id || '')
  const [figmaUrl, setFigmaUrl] = useState(initialFigmaUrl || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connectionId) {
      setError('Please select a Klaviyo account')
      return
    }

    if (!figmaUrl) {
      setError('Please enter a Figma URL')
      return
    }

    setLoading(true)
    setError(null)
    setProgress('Starting import...')

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
            } else if (data.type === 'error') {
              throw new Error(data.message)
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
          if (data.type === 'error') {
            throw new Error(data.message)
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
      setError(err instanceof Error ? err.message : 'An error occurred')
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

  if (klaviyoConnections.length === 0) {
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
        <select
          id="klaviyo-account"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          disabled={loading}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 pr-8 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {klaviyoConnections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.account_name || 'Unnamed account'}
            </option>
          ))}
        </select>
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
        <p className="text-xs text-muted-foreground">
          Paste the URL of your Figma frame. Make sure the URL includes a node-id parameter.
        </p>
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
