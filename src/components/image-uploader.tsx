'use client'

import { useState } from 'react'

interface KlaviyoConnection {
  id: string
  account_name: string | null
}

interface ImageUploaderProps {
  klaviyoConnections: KlaviyoConnection[]
}

interface UploadedImage {
  name: string
  originalUrl: string
  klaviyoUrl: string
  copied: boolean
}

export function ImageUploader({ klaviyoConnections }: ImageUploaderProps) {
  const [figmaUrl, setFigmaUrl] = useState('')
  const [selectedKlaviyoId, setSelectedKlaviyoId] = useState(klaviyoConnections[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [progress, setProgress] = useState<string | null>(null)

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
    setUploadedImages([])
    setProgress('Processing Figma file...')

    try {
      if (!figmaUrl.includes('figma.com/design/')) {
        throw new Error('Please enter a valid Figma design URL')
      }

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figmaUrl,
          klaviyoConnectionId: selectedKlaviyoId,
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) {
        throw new Error('Failed to read response')
      }

      const images: UploadedImage[] = []

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
            } else if (data.type === 'image') {
              images.push({
                name: data.name,
                originalUrl: data.originalUrl,
                klaviyoUrl: data.klaviyoUrl,
                copied: false,
              })
              setUploadedImages([...images])
            } else if (data.type === 'error') {
              setError(data.message)
            } else if (data.type === 'done') {
              setProgress(null)
            }
          } catch (e) {
            console.error('Failed to parse line:', line, e)
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer)
          if (data.type === 'error') {
            setError(data.message)
          }
        } catch (e) {
          console.error('Failed to parse final buffer:', buffer, e)
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url)
      setUploadedImages(prev => prev.map((img, i) =>
        i === index ? { ...img, copied: true } : img
      ))
      setTimeout(() => {
        setUploadedImages(prev => prev.map((img, i) =>
          i === index ? { ...img, copied: false } : img
        ))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const copyAllUrls = async () => {
    const urls = uploadedImages.map(img => img.klaviyoUrl).join('\n')
    try {
      await navigator.clipboard.writeText(urls)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const resetForm = () => {
    setFigmaUrl('')
    setUploadedImages([])
    setError(null)
    setProgress(null)
  }

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <form onSubmit={handleSubmit} className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl space-y-4">
        <div>
          <label htmlFor="klaviyo-account" className="block text-sm font-medium mb-1">
            Klaviyo account
          </label>
          <div className="relative">
            <select
              id="klaviyo-account"
              value={selectedKlaviyoId}
              onChange={(e) => setSelectedKlaviyoId(e.target.value)}
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
            Copy the link to your email design frame in Figma (must include node-id)
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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

        <button
          type="submit"
          disabled={loading || !figmaUrl.trim() || !selectedKlaviyoId}
          className="w-full px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {loading ? 'Uploading...' : 'Upload Images to Klaviyo'}
        </button>
      </form>

      {/* Uploaded images */}
      {uploadedImages.length > 0 && (
        <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Uploaded Images ({uploadedImages.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={copyAllUrls}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Copy all URLs
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Upload more
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {uploadedImages.map((image, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                {/* Thumbnail */}
                <div className="w-16 h-16 flex-shrink-0 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                  <img
                    src={image.klaviyoUrl}
                    alt={image.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{image.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                    {image.klaviyoUrl}
                  </p>
                </div>

                {/* Copy button */}
                <button
                  onClick={() => copyToClipboard(image.klaviyoUrl, index)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0 ${
                    image.copied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {image.copied ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Use these URLs in Klaviyo&apos;s drag &amp; drop editor or in dynamic content blocks.
          </p>
        </div>
      )}
    </div>
  )
}
