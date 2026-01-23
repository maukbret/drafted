'use client'

import { useState } from 'react'

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
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">Connect Figma first</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You need to connect your Figma account before creating a campaign.
        </p>
        <a
          href="/connections"
          className="inline-block px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          Go to Connections
        </a>
      </div>
    )
  }

  if (klaviyoConnections.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">Connect Klaviyo first</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You need to connect a Klaviyo account before creating a campaign.
        </p>
        <a
          href="/connections"
          className="inline-block px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          Go to Connections
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="klaviyo-account" className="block text-sm font-medium mb-1">
          Klaviyo account
        </label>
        <div className="relative">
          <select
            id="klaviyo-account"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm appearance-none cursor-pointer disabled:opacity-50 pr-10"
          >
            {klaviyoConnections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.account_name || 'Unnamed account'}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Select which Klaviyo account to use for this campaign
        </p>
      </div>

      <div>
        <label htmlFor="figma-url" className="block text-sm font-medium mb-1">
          Figma URL
        </label>
        <input
          id="figma-url"
          type="url"
          value={figmaUrl}
          onChange={(e) => setFigmaUrl(e.target.value)}
          placeholder="https://www.figma.com/design/..."
          disabled={loading}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Paste the URL of your Figma frame. Make sure the URL includes a node-id parameter.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {progress && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {progress}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || !connectionId || !figmaUrl}
          className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Continue'}
        </button>
      </div>
    </form>
  )
}
