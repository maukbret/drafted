'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <div className="flex gap-6 h-full min-h-[400px]">
      {/* Left: Email preview */}
      <div className="flex-1 border rounded-xl overflow-hidden flex flex-col">
        <div className="bg-muted px-4 py-3 border-b flex-shrink-0">
          <h2 className="font-medium">Email preview</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-muted/50">
          <div className="max-w-[600px] mx-auto bg-background shadow-sm-sm">
            {groupedFrames.map((item, index) => {
              // Check if this is a pair of frames (side-by-side)
              if (Array.isArray(item)) {
                const [left, right] = item
                return (
                  <div key={`row-${index}`} className="flex">
                    {[left, right].map((frame) => (
                      <div
                        key={frame.id}
                        className={cn(
                          'relative cursor-pointer transition-all w-1/2',
                          activeFrameId === frame.id && 'outline outline-2 outline-primary -outline-offset-2'
                        )}
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
                          <div className="aspect-video bg-muted flex items-center justify-center pointer-events-none">
                            <span className="text-muted-foreground text-xs">No image</span>
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
                  className={cn(
                    'relative cursor-pointer transition-all',
                    activeFrameId === frame.id && 'ring-2 ring-primary'
                  )}
                  onClick={() => setActiveFrameId(frame.id)}
                >
                  {frame.image_url ? (
                    <img
                      src={frame.image_url}
                      alt={frame.name}
                      className="w-full h-auto block"
                    />
                  ) : (
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground">No image</span>
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
        <div className="border rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="bg-muted px-4 py-3 border-b flex-shrink-0">
            <h2 className="font-medium">Section links</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Add links to make sections clickable
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {frames.map((frame, index) => (
                <div
                  key={frame.id}
                  className={cn(
                    'p-3 cursor-pointer transition-colors',
                    activeFrameId === frame.id ? 'bg-muted' : 'hover:bg-muted/50'
                  )}
                  onClick={() => setActiveFrameId(frame.id)}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-shrink-0 w-12 h-8 bg-muted rounded overflow-hidden">
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
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                        50%
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteModalFrame(frame)
                      }}
                      className="flex-shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete section"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Input
                    type="text"
                    value={frame.link_url || ''}
                    onChange={(e) => updateFrameLink(frame.id, e.target.value)}
                    onBlur={(e) => handleLinkBlur(frame.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="google.com or https://..."
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-3">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={saving}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              className="flex-1"
            >
              {saving ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <AlertDialog open={!!deleteModalFrame} onOpenChange={(open) => !open && !isDeleting && setDeleteModalFrame(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>Delete section</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">&quot;{deleteModalFrame?.name}&quot;</span>? This section will be removed from your email.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFrame}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
