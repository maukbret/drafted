'use client'

import { useState } from 'react'

interface Frame {
  id: string
  figma_node_id: string
  name: string
  image_url: string | null
  klaviyo_image_url: string | null
  link_url: string | null
  display_order: number
}

interface EmailEditorProps {
  projectId: string
  frames: Frame[]
  klaviyoConnected: boolean
}

// Auto-fix URLs without protocol
function normalizeUrl(url: string): string {
  if (!url || url.trim() === '') return ''
  const trimmed = url.trim()
  // Already has a protocol
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  // Has mailto: or tel: etc
  if (/^[a-z]+:/i.test(trimmed)) return trimmed
  // Add https://
  return `https://${trimmed}`
}

export function EmailEditor({ projectId, frames: initialFrames, klaviyoConnected }: EmailEditorProps) {
  const [frames, setFrames] = useState(initialFrames)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null)

  const updateFrameLink = (frameId: string, linkUrl: string) => {
    setFrames(prev => prev.map(f => 
      f.id === frameId ? { ...f, link_url: linkUrl } : f
    ))
  }

  const handleLinkBlur = (frameId: string, linkUrl: string) => {
    const normalized = normalizeUrl(linkUrl)
    if (normalized !== linkUrl) {
      updateFrameLink(frameId, normalized)
    }
  }

  const saveLinks = async () => {
    setSaving(true)
    setMessage(null)

    // Normalize all URLs before saving
    const normalizedFrames = frames.map(f => ({
      ...f,
      link_url: normalizeUrl(f.link_url || '')
    }))
    setFrames(normalizedFrames)

    try {
      const response = await fetch('/api/frames/update-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: normalizedFrames.map(f => ({ id: f.id, link_url: f.link_url || null }))
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      setMessage({ type: 'success', text: 'Links saved!' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save links' })
    } finally {
      setSaving(false)
    }
  }

  const exportToKlaviyo = async () => {
    setExporting(true)
    setMessage(null)

    try {
      // First save the links
      await saveLinks()

      // Then export to Klaviyo
      const response = await fetch('/api/klaviyo/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Export failed')
      }

      setMessage({ type: 'success', text: 'Email exported to Klaviyo! Check your templates.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Export failed' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left: Email preview */}
      <div className="flex-1 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="font-medium">Email preview</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-gray-950">
          <div className="max-w-[600px] mx-auto bg-white dark:bg-gray-900 shadow-sm">
            {frames.map((frame) => (
              <div 
                key={frame.id} 
                className={`relative cursor-pointer transition-all ${activeFrameId === frame.id ? 'ring-2 ring-black dark:ring-white' : ''}`}
                onClick={() => setActiveFrameId(frame.id)}
              >
                {frame.image_url ? (
                  <img
                    src={frame.image_url}
                    alt={frame.name}
                    className="w-full h-auto block"
                  />
                ) : (
                  <div className="aspect-video bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-500">No image</span>
                  </div>
                )}
                {frame.link_url && (
                  <div className="absolute bottom-2 left-2 right-2">
                    <span className="text-xs bg-black/70 text-white px-2 py-1 rounded truncate block">
                      {frame.link_url}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Link editor */}
      <div className="w-96 flex-shrink-0 flex flex-col">
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <h2 className="font-medium">Section links</h2>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
            {frames.map((frame, index) => (
              <div 
                key={frame.id} 
                className={`p-3 cursor-pointer transition-colors ${activeFrameId === frame.id ? 'bg-gray-50 dark:bg-gray-900' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}
                onClick={() => setActiveFrameId(frame.id)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-shrink-0 w-12 h-8 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                    {frame.image_url && (
                      <img
                        src={frame.image_url}
                        alt={frame.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <p className="text-sm font-medium truncate flex-1">{frame.name}</p>
                </div>
                <input
                  type="text"
                  value={frame.link_url || ''}
                  onChange={(e) => updateFrameLink(frame.id, e.target.value)}
                  onBlur={(e) => handleLinkBlur(frame.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="google.com or https://..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
              </div>
            ))}
          </div>
        </div>


        {/* Actions */}
        <div className="mt-4 space-y-3">
          {message && (
            <p className={`text-sm ${message.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {message.text}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={saveLinks}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>

            <button
              onClick={exportToKlaviyo}
              disabled={exporting || !klaviyoConnected}
              className="flex-1 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export to Klaviyo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
