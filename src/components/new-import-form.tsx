'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface KlaviyoConnection {
  id: string
  account_name: string | null
}

interface NewImportFormProps {
  klaviyoConnections: KlaviyoConnection[]
}

export function NewImportForm({ klaviyoConnections }: NewImportFormProps) {
  const [figmaUrl, setFigmaUrl] = useState('')
  const [selectedKlaviyoId, setSelectedKlaviyoId] = useState(klaviyoConnections[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!figmaUrl.trim()) {
      setError('Please enter a Figma URL')
      return
    }

    if (!selectedKlaviyoId) {
      setError('Please select a Klaviyo account')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (!figmaUrl.includes('figma.com/design/')) {
        throw new Error('Please enter a valid Figma design URL')
      }

      const response = await fetch('/api/figma/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figmaUrl,
          klaviyoConnectionId: selectedKlaviyoId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process Figma file')
      }

      router.push(`/dashboard/email/${data.projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl space-y-4">
      <div>
        <label htmlFor="klaviyo-account" className="block text-sm font-medium mb-1">
          Klaviyo account
        </label>
        <select
          id="klaviyo-account"
          value={selectedKlaviyoId}
          onChange={(e) => setSelectedKlaviyoId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
        >
          {klaviyoConnections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.account_name || 'Unnamed account'}
            </option>
          ))}
        </select>
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
          Copy the link to your email design frame in Figma (must include node-id)
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !figmaUrl.trim() || !selectedKlaviyoId}
        className="w-full px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {loading ? 'Processing...' : 'Import from Figma'}
      </button>
    </form>
  )
}
