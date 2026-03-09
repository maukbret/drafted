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

export interface ProductFeedPreviewData {
  layout: '1-column' | '2-column' | '3-column'
  buttonColor: string
  buttonTextColor: string
  buttonText: string
  showPrice: boolean
  showTitle: boolean
  imageRatio: 'square' | 'original'
  productCount: number
  feedName: string
}

interface CampaignEmailPreviewProps {
  frames: CampaignPreviewFrame[]
  footerHtml?: string | null
  productFeedPreview?: ProductFeedPreviewData | null
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

const MOCK_PRODUCTS = [
  { title: 'Classic T-Shirt', price: '$29.99', image: '' },
  { title: 'Denim Jacket', price: '$89.00', image: '' },
  { title: 'Canvas Sneakers', price: '$65.00', image: '' },
  { title: 'Leather Belt', price: '$45.00', image: '' },
  { title: 'Wool Beanie', price: '$24.99', image: '' },
  { title: 'Cotton Hoodie', price: '$55.00', image: '' },
  { title: 'Linen Shorts', price: '$42.00', image: '' },
  { title: 'Silk Scarf', price: '$35.00', image: '' },
  { title: 'Sport Watch', price: '$120.00', image: '' },
]

function ProductFeedMockPreview({ data }: { data: ProductFeedPreviewData }) {
  const cols = data.layout === '1-column' ? 1 : data.layout === '2-column' ? 2 : 3
  const products = MOCK_PRODUCTS.slice(0, data.productCount)

  return (
    <div className="py-4 px-2">
      <div
        className="grid gap-2 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          maxWidth: '100%',
        }}
      >
        {products.map((product, i) => (
          <div key={i} className="flex flex-col items-center text-center">
            <div
              className="w-full bg-gray-100 rounded"
              style={{
                aspectRatio: data.imageRatio === 'square' ? '1' : '3/4',
              }}
            />
            {data.showTitle && (
              <p className="text-[11px] font-semibold mt-1.5 text-gray-800 leading-tight">{product.title}</p>
            )}
            {data.showPrice && (
              <p className="text-[10px] text-gray-500 mt-0.5">{product.price}</p>
            )}
            <span
              className="mt-1.5 mb-1 text-[10px] font-semibold px-3 py-1 rounded inline-block"
              style={{
                backgroundColor: data.buttonColor,
                color: data.buttonTextColor,
              }}
            >
              {data.buttonText}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-center text-muted-foreground mt-2">
        Product feed: {data.feedName} ({data.productCount} product{data.productCount !== 1 ? 's' : ''})
      </p>
    </div>
  )
}

export function CampaignEmailPreview({
  frames,
  footerHtml,
  productFeedPreview,
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
      {productFeedPreview && (
        <ProductFeedMockPreview data={productFeedPreview} />
      )}
      {sanitizedFooterHtml && (
        <div
          className="[&_img]:max-w-full [&_img]:h-auto"
          dangerouslySetInnerHTML={{ __html: sanitizedFooterHtml }}
        />
      )}
    </div>
  )
}
