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

    try {
      // Process the Figma URL
      const response = await fetch(`/api/campaigns/${campaignId}/process-figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to process Figma design')
      }

      onComplete({ connectionId, figmaUrl })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
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
          href="/dashboard/connections"
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
          href="/dashboard/connections"
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
        <select
          id="klaviyo-account"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
        >
          {klaviyoConnections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.account_name || 'Unnamed account'}
            </option>
          ))}
        </select>
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
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
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
