'use client'

import { getFrameDisplayUrl } from '@/lib/frame-url'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CampaignEmailPreview } from './campaign-email-preview'
import { Copy, Globe, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Frame {
  id: string
  figma_node_id: string
  name: string
  width: number | null
  image_url: string | null
  klaviyo_image_url?: string | null
  link_url: string | null
  display_order: number
}

// Half-width threshold: 50% of 600px email width
const HALF_WIDTH_THRESHOLD = 300

interface Step2EditorProps {
  frames: Frame[]
  defaultLinkPlaceholder?: string
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

export function Step2Editor({ frames: initialFrames, defaultLinkPlaceholder, onComplete, onBack }: Step2EditorProps) {
  const [frames, setFrames] = useState(initialFrames)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null)
  const [editingAltFrameId, setEditingAltFrameId] = useState<string | null>(null)
  const [deleteModalFrame, setDeleteModalFrame] = useState<Frame | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showValidation, setShowValidation] = useState(false)

  const missingLinkFrames = useMemo(
    () => frames.filter(frame => !frame.link_url || frame.link_url.trim() === ''),
    [frames]
  )
  const missingLinkFrameIds = useMemo(
    () => new Set(missingLinkFrames.map(frame => frame.id)),
    [missingLinkFrames]
  )
  const hasMissingLinks = missingLinkFrames.length > 0

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

  const isWebUrl = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:'

  const applyDomainToLink = (linkUrl: string, targetDomainUrl: URL): string => {
    const normalizedLink = normalizeUrl(linkUrl)
    if (!normalizedLink) return targetDomainUrl.toString()

    try {
      const parsed = new URL(normalizedLink)
      if (!isWebUrl(parsed)) return normalizedLink

      parsed.protocol = targetDomainUrl.protocol
      parsed.host = targetDomainUrl.host
      return parsed.toString()
    } catch {
      return targetDomainUrl.toString()
    }
  }

  const handleApplyDomainToAll = (sourceLink: string) => {
    const normalizedSource = normalizeUrl(sourceLink)
    if (!normalizedSource) {
      setError('Add a URL first, then apply its domain to all sections.')
      return
    }

    let parsedSource: URL
    try {
      parsedSource = new URL(normalizedSource)
    } catch {
      setError('Enter a valid URL before applying its domain.')
      return
    }

    if (!isWebUrl(parsedSource)) {
      setError('Only http/https URLs can be used to apply a domain.')
      return
    }

    const targetDomain = new URL(parsedSource.origin)
    setFrames(prev =>
      prev.map(frame => ({
        ...frame,
        link_url: applyDomainToLink(frame.link_url || '', targetDomain)
      }))
    )
    setError(null)
  }

  const handleCopyLinkDown = (frameIndex: number) => {
    const sourceLink = frames[frameIndex]?.link_url || ''
    if (!sourceLink.trim()) return

    setFrames(prev => prev.map((frame, index) => {
      if (index <= frameIndex) return frame
      if (frame.link_url && frame.link_url.trim() !== '') return frame
      return { ...frame, link_url: sourceLink }
    }))
    setError(null)
  }

  const updateFrameName = (frameId: string, name: string) => {
    setFrames(prev => prev.map(f =>
      f.id === frameId ? { ...f, name } : f
    ))
  }

  const handleAltBlur = (frameId: string, name: string) => {
    const normalized = name.trim() || 'Untitled section'
    updateFrameName(frameId, normalized)
    setEditingAltFrameId(null)
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
    if (hasMissingLinks) {
      setShowValidation(true)
      setError(null)
      if (missingLinkFrames[0]) {
        setActiveFrameId(missingLinkFrames[0].id)
      }
      return
    }

    setSaving(true)
    setError(null)

    const normalizedFrames = frames.map(f => ({
      ...f,
      name: f.name.trim() || 'Untitled section',
      link_url: normalizeUrl(f.link_url || '')
    }))
    setFrames(normalizedFrames)

    try {
      const response = await fetch('/api/frames/update-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: normalizedFrames.map(f => ({
            id: f.id,
            name: f.name,
            link_url: f.link_url || null,
          }))
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
    <TooltipProvider delayDuration={150}>
      <div className="flex gap-6 h-full min-h-[400px]">
      {/* Left: Email preview */}
      <div className="flex-1 min-w-0 border rounded-xl overflow-hidden flex flex-col">
        <div className="bg-muted px-4 py-3 border-b flex-shrink-0">
          <h2 className="font-medium">Email preview</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-muted/50">
          <CampaignEmailPreview
            frames={frames}
            activeFrameId={activeFrameId}
            onFrameSelect={setActiveFrameId}
            showLinkBadges
          />
        </div>
      </div>

      {/* Right: Link editor */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="border rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="bg-muted px-4 py-3 border-b flex-shrink-0">
            <h2 className="font-medium">Section links</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Add links to make sections clickable. Each section requires a URL.
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {frames.map((frame, index) => {
                const frameImageUrl = getFrameDisplayUrl(frame)
                return (
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
                        {frameImageUrl && (
                          <img
                            src={frameImageUrl}
                            alt={frame.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Alt:</span>
                          {editingAltFrameId === frame.id ? (
                            <Input
                              type="text"
                              value={frame.name}
                              onChange={(e) => updateFrameName(frame.id, e.target.value)}
                              onBlur={(e) => handleAltBlur(frame.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAltBlur(frame.id, (e.target as HTMLInputElement).value)
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault()
                                  setEditingAltFrameId(null)
                                }
                              }}
                              autoFocus
                              className="h-7 min-w-0 flex-1 text-sm font-normal"
                              aria-label="Edit alt text"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingAltFrameId(frame.id)
                                setActiveFrameId(frame.id)
                              }}
                              className="min-w-0 flex-1 truncate text-left text-sm font-normal hover:underline"
                              title={frame.name}
                            >
                              {frame.name}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
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
                    </div>
                    <div className="relative">
                      <Input
                        type="text"
                        value={frame.link_url || ''}
                        onChange={(e) => updateFrameLink(frame.id, e.target.value)}
                        onBlur={(e) => handleLinkBlur(frame.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={defaultLinkPlaceholder || 'google.com or https://...'}
                        className={cn(
                          'h-8 pr-16',
                          showValidation && missingLinkFrameIds.has(frame.id) && 'border-destructive focus-visible:ring-destructive'
                        )}
                        aria-invalid={showValidation && missingLinkFrameIds.has(frame.id)}
                        aria-describedby={showValidation && missingLinkFrameIds.has(frame.id) ? `frame-link-${frame.id}-error` : undefined}
                      />
                      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleApplyDomainToAll(frame.link_url || '')
                              }}
                              disabled={!frame.link_url?.trim() || saving}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                              aria-label="Apply this link domain to all sections"
                            >
                              <Globe className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Apply this domain to all links
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyLinkDown(index)
                              }}
                              disabled={!frame.link_url?.trim() || index === frames.length - 1 || saving}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                              aria-label="Copy this link to empty sections below"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Copy to empty links below
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {showValidation && missingLinkFrameIds.has(frame.id) && (
                      <p
                        id={`frame-link-${frame.id}-error`}
                        className="mt-1 text-xs text-destructive"
                      >
                        Required. Add a URL for this section.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-3">
          {showValidation && hasMissingLinks && (
            <p className="text-sm text-destructive">
              {missingLinkFrames.length} section{missingLinkFrames.length === 1 ? '' : 's'} missing a URL.
            </p>
          )}
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
    </TooltipProvider>
  )
}
