'use client'

import { useState, useMemo } from 'react'

interface Frame {
  id: string
  figma_node_id: string
  name: string
  width: number | null
  image_url: string | null
  link_url: string | null
  display_order: number
}

// Half-width threshold: 50% of 600px email width
const HALF_WIDTH_THRESHOLD = 300

// Group frames for side-by-side layout
// Consecutive frames with width <= 300px are grouped in pairs
function groupFramesForLayout(frames: Frame[]): (Frame | [Frame, Frame])[] {
  const result: (Frame | [Frame, Frame])[] = []
  let i = 0

  while (i < frames.length) {
    const current = frames[i]
    const next = frames[i + 1]

    const currentIsHalf = (current.width ?? 600) <= HALF_WIDTH_THRESHOLD
    const nextIsHalf = next && (next.width ?? 600) <= HALF_WIDTH_THRESHOLD

    if (currentIsHalf && nextIsHalf) {
      // Group two half-width frames together
      result.push([current, next])
      i += 2
    } else {
      // Single frame (full-width or unpaired half-width)
      result.push(current)
      i += 1
    }
  }

  return result
}

interface Step2EditorProps {
  frames: Frame[]
  onComplete: (frames: Frame[]) => void
  onBack: () => void
}

function normalizeUrl(url: string): string {
  if (!url || url.trim() === '') return ''
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z]+:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function Step2Editor({ frames: initialFrames, onComplete, onBack }: Step2EditorProps) {
  const [frames, setFrames] = useState(initialFrames)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null)
  const [deleteModalFrame, setDeleteModalFrame] = useState<Frame | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Memoize grouped frames to avoid recalculating on every render
  const groupedFrames = useMemo(() => groupFramesForLayout(frames), [frames])

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

  const handleDeleteFrame = async () => {
    if (!deleteModalFrame) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/frames/${deleteModalFrame.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete section')
      }

      // Remove from local state
      setFrames(prev => prev.filter(f => f.id !== deleteModalFrame.id))

      // Clear active selection if deleted frame was selected
      if (activeFrameId === deleteModalFrame.id) {
        setActiveFrameId(null)
      }

      setDeleteModalFrame(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleContinue = async () => {
    setSaving(true)
    setError(null)

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
        throw new Error('Failed to save links')
      }

      onComplete(normalizedFrames)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-20rem)]">
      {/* Left: Email preview */}
      <div className="flex-1 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="font-medium">Email preview</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-gray-950">
          <div className="max-w-[600px] mx-auto bg-white dark:bg-gray-900 shadow-sm">
            {groupedFrames.map((item, index) => {
              // Check if this is a pair of frames (side-by-side)
              if (Array.isArray(item)) {
                const [left, right] = item
                return (
                  <div key={`row-${index}`} className="flex">
                    {[left, right].map((frame) => (
                      <div
                        key={frame.id}
                        className={`relative cursor-pointer transition-all w-1/2 ${activeFrameId === frame.id ? 'outline outline-2 outline-black dark:outline-white -outline-offset-2' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveFrameId(frame.id)
                        }}
                      >
                        {frame.image_url ? (
                          <img
                            src={frame.image_url}
                            alt={frame.name}
                            className="w-full h-auto block pointer-events-none"
                          />
                        ) : (
                          <div className="aspect-video bg-gray-200 dark:bg-gray-800 flex items-center justify-center pointer-events-none">
                            <span className="text-gray-500 text-xs">No image</span>
                          </div>
                        )}
                        {frame.link_url && (
                          <div className="absolute bottom-1 left-1 right-1 pointer-events-none">
                            <span className="text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded truncate block">
                              {frame.link_url}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }

              // Single frame (full-width)
              const frame = item
              return (
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
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: Link editor */}
      <div className="w-96 flex-shrink-0 flex flex-col">
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <h2 className="font-medium">Section links</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Add links to make sections clickable
            </p>
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
                  {(frame.width ?? 600) <= HALF_WIDTH_THRESHOLD && (
                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                      50%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteModalFrame(frame)
                    }}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Delete section"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isDeleting && setDeleteModalFrame(null)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Delete section</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete <span className="font-medium">&quot;{deleteModalFrame.name}&quot;</span>? This section will be removed from your email.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModalFrame(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFrame}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
