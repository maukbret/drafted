'use client'

import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { normalizeFooterHtmlForExport } from '@/lib/email/footer-normalize'

export interface CampaignPreviewFrame {
  id: string
  name: string
  width: number | null
  image_url: string | null
  link_url: string | null
}

interface CampaignEmailPreviewProps {
  frames: CampaignPreviewFrame[]
  footerHtml?: string | null
  activeFrameId?: string | null
  onFrameSelect?: (frameId: string) => void
  showLinkBadges?: boolean
  emptyMessage?: string
}

const HALF_WIDTH_THRESHOLD = 300

function groupFramesForLayout(frames: CampaignPreviewFrame[]): (CampaignPreviewFrame | [CampaignPreviewFrame, CampaignPreviewFrame])[] {
  const result: (CampaignPreviewFrame | [CampaignPreviewFrame, CampaignPreviewFrame])[] = []
  let i = 0

  while (i < frames.length) {
    const current = frames[i]
    const next = frames[i + 1]

    const currentIsHalf = (current.width ?? 600) <= HALF_WIDTH_THRESHOLD
    const nextIsHalf = next && (next.width ?? 600) <= HALF_WIDTH_THRESHOLD

    if (currentIsHalf && nextIsHalf) {
      result.push([current, next])
      i += 2
    } else {
      result.push(current)
      i += 1
    }
  }

  return result
}

export function CampaignEmailPreview({
  frames,
  footerHtml,
  activeFrameId,
  onFrameSelect,
  showLinkBadges = false,
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

  return (
    <div className="max-w-[600px] mx-auto bg-background shadow-sm-sm">
      {groupedFrames.map((item, index) => {
        if (Array.isArray(item)) {
          const [left, right] = item
          return (
            <div key={`row-${index}`} className="flex">
              {[left, right].map((frame) => (
                <div
                  key={frame.id}
                  className={cn(
                    'relative transition-all w-1/2',
                    isInteractive && 'cursor-pointer',
                    activeFrameId === frame.id && 'outline outline-2 outline-primary -outline-offset-2'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFrameSelect?.(frame.id)
                  }}
                >
                  {frame.image_url ? (
                    <img
                      src={frame.image_url}
                      alt={frame.name}
                      className={cn('w-full h-auto block', isInteractive && 'pointer-events-none')}
                    />
                  ) : (
                    <div className={cn('aspect-video bg-muted flex items-center justify-center', isInteractive && 'pointer-events-none')}>
                      <span className="text-muted-foreground text-xs">No image</span>
                    </div>
                  )}
                  {showLinkBadges && frame.link_url && (
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

        const frame = item
        return (
          <div
            key={frame.id}
            className={cn(
              'relative transition-all',
              isInteractive && 'cursor-pointer',
              activeFrameId === frame.id && 'ring-2 ring-primary'
            )}
            onClick={() => onFrameSelect?.(frame.id)}
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
            {showLinkBadges && frame.link_url && (
              <div className="absolute bottom-2 left-2 right-2">
                <span className="text-xs bg-black/70 text-white px-2 py-1 rounded truncate block">
                  {frame.link_url}
                </span>
              </div>
            )}
          </div>
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
}
