'use client'

import { useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import DOMPurify from 'dompurify'
import { getFrameDisplayUrl } from '@/lib/frame-url'
import { cn } from '@/lib/utils'
import { normalizeFooterHtmlForExport } from '@/lib/email/footer-normalize'
import {
  isThreeColumnFrameWidth,
  isTwoColumnFrameWidth,
} from '@/lib/email/frame-rows-html'

export interface CampaignPreviewFrame {
  id: string
  name: string
  width: number | null
  image_url: string | null
  klaviyo_image_url?: string | null
  link_url: string | null
}

interface CampaignEmailPreviewProps {
  frames: CampaignPreviewFrame[]
  footerHtml?: string | null
  activeFrameId?: string | null
  onFrameSelect?: (frameId: string) => void
  showLinkBadges?: boolean
  /** Hover a frame to see its link URL (e.g. step 3 sticky preview). */
  showSectionLinkTooltips?: boolean
  emptyMessage?: string
}

function SectionLinkCursorTooltip({
  x,
  y,
  linkLabel,
}: {
  x: number
  y: number
  linkLabel: string
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] max-w-[min(90vw,22rem)] rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md outline-none"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Section link
      </p>
      <p className="text-xs mt-1 break-all">{linkLabel}</p>
    </div>,
    document.body
  )
}

function PreviewFrameSection({
  frame,
  isInteractive,
  activeFrameId,
  onFrameSelect,
  colClass,
  showLinkBadges,
  showSectionLinkTooltips,
  stopPropagationOnClick = false,
}: {
  frame: CampaignPreviewFrame
  isInteractive: boolean
  activeFrameId?: string | null
  onFrameSelect?: (frameId: string) => void
  colClass?: string
  showLinkBadges: boolean
  showSectionLinkTooltips: boolean
  stopPropagationOnClick?: boolean
}) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const frameImageUrl = getFrameDisplayUrl(frame)
  const linkLabel = frame.link_url?.trim()
    ? frame.link_url.trim()
    : 'No link URL set for this section'

  const handleClick =
    isInteractive && onFrameSelect
      ? stopPropagationOnClick
        ? (e: MouseEvent<HTMLDivElement>) => {
            e.stopPropagation()
            onFrameSelect(frame.id)
          }
        : () => {
            onFrameSelect(frame.id)
          }
      : undefined

  const trackPointer = showSectionLinkTooltips
    ? (e: MouseEvent<HTMLDivElement>) => {
        setPointer({ x: e.clientX, y: e.clientY })
      }
    : undefined

  const clearPointer = showSectionLinkTooltips
    ? () => {
        setPointer(null)
      }
    : undefined

  /** Same orange slice highlight as `email-slicer` active regions */
  const sectionLinkHoverOverlay =
    showSectionLinkTooltips && pointer !== null ? (
      <div
        className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-150"
        style={{ backgroundColor: 'rgba(255, 71, 2, 0.15)' }}
        aria-hidden
      />
    ) : null

  const block = (
    <div
      className={cn(
        'relative',
        colClass,
        isInteractive && 'cursor-pointer',
        showSectionLinkTooltips && !isInteractive && 'cursor-help',
        activeFrameId === frame.id &&
          (colClass
            ? 'outline outline-2 outline-primary -outline-offset-2'
            : 'ring-2 ring-primary')
      )}
      onClick={handleClick}
      onMouseEnter={trackPointer}
      onMouseMove={trackPointer}
      onMouseLeave={clearPointer}
    >
      {frameImageUrl ? (
        <img
          src={frameImageUrl}
          alt={frame.name}
          className={cn('w-full h-auto block', isInteractive && 'pointer-events-none')}
        />
      ) : (
        <div
          className={cn(
            'aspect-video bg-muted flex items-center justify-center',
            isInteractive && 'pointer-events-none'
          )}
        >
          <span className={cn('text-muted-foreground', colClass ? 'text-xs' : undefined)}>
            No image
          </span>
        </div>
      )}
      {sectionLinkHoverOverlay}
      {showLinkBadges && frame.link_url && (
        <div
          className={cn(
            'absolute z-[2] pointer-events-none',
            colClass ? 'bottom-1 left-1 right-1' : 'bottom-2 left-2 right-2'
          )}
        >
          <span
            className={cn(
              'bg-black/70 text-white rounded truncate block',
              colClass ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
            )}
          >
            {frame.link_url}
          </span>
        </div>
      )}
    </div>
  )

  if (!showSectionLinkTooltips) return block

  return (
    <>
      {block}
      {pointer ? (
        <SectionLinkCursorTooltip x={pointer.x} y={pointer.y} linkLabel={linkLabel} />
      ) : null}
    </>
  )
}

type PreviewLayoutRow =
  | CampaignPreviewFrame
  | [CampaignPreviewFrame, CampaignPreviewFrame]
  | [CampaignPreviewFrame, CampaignPreviewFrame, CampaignPreviewFrame]

function groupFramesForLayout(frames: CampaignPreviewFrame[]): PreviewLayoutRow[] {
  const result: PreviewLayoutRow[] = []
  let i = 0

  while (i < frames.length) {
    const current = frames[i]
    const next = frames[i + 1]
    const next2 = frames[i + 2]

    if (
      next &&
      next2 &&
      isThreeColumnFrameWidth(current.width) &&
      isThreeColumnFrameWidth(next.width) &&
      isThreeColumnFrameWidth(next2.width)
    ) {
      result.push([current, next, next2])
      i += 3
      continue
    }

    if (next && isTwoColumnFrameWidth(current.width) && isTwoColumnFrameWidth(next.width)) {
      result.push([current, next])
      i += 2
      continue
    }

    result.push(current)
    i += 1
  }

  return result
}

export function CampaignEmailPreview({
  frames,
  footerHtml,
  activeFrameId,
  onFrameSelect,
  showLinkBadges = false,
  showSectionLinkTooltips = false,
  emptyMessage = 'No preview available',
}: CampaignEmailPreviewProps) {
  const groupedFrames = groupFramesForLayout(frames)
  const isInteractive = typeof onFrameSelect === 'function'
  const sanitizedFooterHtml = footerHtml
    ? DOMPurify.sanitize(normalizeFooterHtmlForExport(footerHtml), {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'rel'],
    })
    : ''

  if (frames.length === 0) {
    return (
      <div className="max-w-[600px] mx-auto bg-background shadow-sm-sm p-8 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  const body = (
    <div className="max-w-[600px] mx-auto bg-background shadow-sm-sm">
      {groupedFrames.map((item) => {
        if (Array.isArray(item)) {
          const colClass = item.length === 3 ? 'w-1/3' : 'w-1/2'
          return (
            <div key={`row-${item.map((f) => f.id).join('-')}`} className="flex">
              {item.map((frame) => (
                <PreviewFrameSection
                  key={frame.id}
                  frame={frame}
                  isInteractive={isInteractive}
                  activeFrameId={activeFrameId}
                  onFrameSelect={onFrameSelect}
                  colClass={colClass}
                  showLinkBadges={showLinkBadges}
                  showSectionLinkTooltips={showSectionLinkTooltips}
                  stopPropagationOnClick
                />
              ))}
            </div>
          )
        }

        const frame = item
        return (
          <PreviewFrameSection
            key={frame.id}
            frame={frame}
            isInteractive={isInteractive}
            activeFrameId={activeFrameId}
            onFrameSelect={onFrameSelect}
            showLinkBadges={showLinkBadges}
            showSectionLinkTooltips={showSectionLinkTooltips}
          />
        )
      })}
      {sanitizedFooterHtml && (
        <div
          className="[&_img]:max-w-full [&_img]:h-auto"
          dangerouslySetInnerHTML={{ __html: sanitizedFooterHtml }}
        />
      )}
    </div>
  )

  return body
}
