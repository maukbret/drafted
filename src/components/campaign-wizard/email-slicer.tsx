'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  EMAIL_LAYOUT_THREE_COL_CELL_WIDTH,
} from '@/lib/email/frame-rows-html'
import { Plus, GripHorizontal, X, Loader2, Copy, Globe } from 'lucide-react'

interface Frame {
  id: string
  figma_node_id: string
  name: string
  width: number | null
  image_url: string | null
  link_url: string | null
  display_order: number
}

type SliceColumnLayout = 'full' | 'half' | 'third'

/** Active column tab in the slicer UI (overlay follows this for multi-column rows). */
type SlicerColumnTab = 'left' | 'center' | 'right'

export interface SliceDefinition {
  id: string
  y: number
  height: number
  type: SliceColumnLayout
  linkUrl: string
  altText: string
  leftLinkUrl: string
  leftAltText: string
  centerLinkUrl: string
  centerAltText: string
  rightLinkUrl: string
  rightAltText: string
}

function defaultSliceContentFields(): Pick<
  SliceDefinition,
  | 'type'
  | 'linkUrl'
  | 'altText'
  | 'leftLinkUrl'
  | 'leftAltText'
  | 'centerLinkUrl'
  | 'centerAltText'
  | 'rightLinkUrl'
  | 'rightAltText'
> {
  return {
    type: 'full',
    linkUrl: '',
    altText: 'Email section',
    leftLinkUrl: '',
    leftAltText: 'Left column',
    centerLinkUrl: '',
    centerAltText: 'Center column',
    rightLinkUrl: '',
    rightAltText: 'Right column',
  }
}

interface EmailSlicerProps {
  campaignId: string
  projectId: string
  frames: Frame[]
  /** Full-bleed source (persists after finalize); falls back to frames[0].image_url */
  sliceMasterImageUrl?: string | null
  /** Restore slicer dividers + links from last finalize */
  initialSliceLayout?: SliceDefinition[] | null
  klaviyoHybridDndSlot: boolean
  onKlaviyoHybridDndSlotChange: (value: boolean) => void
  onComplete: (frames: Frame[]) => void
  onBack: () => void
}

const MIN_SLICE_HEIGHT = 20

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

export function EmailSlicer({
  campaignId,
  projectId,
  frames,
  sliceMasterImageUrl,
  initialSliceLayout,
  klaviyoHybridDndSlot,
  onKlaviyoHybridDndSlotChange,
  onComplete,
  onBack,
}: EmailSlicerProps) {
  const fullImage = frames[0]
  const imageUrl = sliceMasterImageUrl || fullImage?.image_url || ''
  // After finalize, frame widths are slice cells (300 / 200); master image is always full email width
  const designWidth = sliceMasterImageUrl ? 600 : (fullImage?.width || 600)

  const [imageNaturalHeight, setImageNaturalHeight] = useState(0)
  const [imageNaturalWidth, setImageNaturalWidth] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Design height calculated from the natural image dimensions and actual export scale.
  // Export scale is dynamic (target width based), so we cannot assume a fixed 2x ratio.
  const exportScale = imageNaturalWidth > 0 && designWidth > 0
    ? imageNaturalWidth / designWidth
    : 1
  const designHeight = imageNaturalHeight > 0 && exportScale > 0
    ? Math.round(imageNaturalHeight / exportScale)
    : 0

  const [slices, setSlices] = useState<SliceDefinition[]>([])
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null)
  const [activeColumnTabBySliceId, setActiveColumnTabBySliceId] = useState<
    Record<string, SlicerColumnTab>
  >({})
  const [draggingDivider, setDraggingDivider] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [hoverY, setHoverY] = useState<number | null>(null) // design-pixel Y of hover line
  const [isHoveringImage, setIsHoveringImage] = useState(false)

  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const restoredLayoutRef = useRef(false)

  useEffect(() => {
    restoredLayoutRef.current = false
  }, [campaignId, projectId])

  // Initialize slices once image is loaded (restore saved layout or single full-height slice)
  useEffect(() => {
    if (!imageLoaded || designHeight <= 0 || slices.length > 0) return

    const layout = initialSliceLayout
    if (layout && layout.length > 0 && !restoredLayoutRef.current) {
      restoredLayoutRef.current = true
      const normalized = layout.map(s => ({
        ...s,
        y: Math.max(0, Math.min(s.y, designHeight - MIN_SLICE_HEIGHT)),
        height: Math.max(
          MIN_SLICE_HEIGHT,
          Math.min(s.height, designHeight - Math.max(0, s.y)),
        ),
      }))
      setSlices(normalized)
      setActiveSliceId(normalized[0]?.id ?? null)
      return
    }

    const initialId = generateId()
    setSlices([{
      id: initialId,
      y: 0,
      height: designHeight,
      ...defaultSliceContentFields(),
    }])
    setActiveSliceId(initialId)
  }, [imageLoaded, designHeight, initialSliceLayout, slices.length])

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageNaturalWidth(img.naturalWidth)
    setImageNaturalHeight(img.naturalHeight)
    setImageLoaded(true)
  }, [])

  // Display scale: how the image is scaled for display in the container
  const containerWidth = imageContainerRef.current?.clientWidth || 600
  const displayScale = containerWidth / designWidth

  // Scroll the image preview to show the active section
  useEffect(() => {
    if (!activeSliceId || !scrollContainerRef.current || !imageContainerRef.current) return
    const slice = slices.find(s => s.id === activeSliceId)
    if (!slice) return

    const containerRect = imageContainerRef.current.getBoundingClientRect()
    const scrollEl = scrollContainerRef.current
    const scrollRect = scrollEl.getBoundingClientRect()

    const sliceTopInContainer = slice.y * displayScale
    const sliceBottomInContainer = (slice.y + slice.height) * displayScale

    const imageOffsetTop = containerRect.top - scrollRect.top + scrollEl.scrollTop

    const sliceTopAbsolute = imageOffsetTop + sliceTopInContainer
    const sliceBottomAbsolute = imageOffsetTop + sliceBottomInContainer
    const viewTop = scrollEl.scrollTop
    const viewBottom = viewTop + scrollEl.clientHeight

    if (sliceTopAbsolute < viewTop || sliceBottomAbsolute > viewBottom) {
      scrollEl.scrollTo({ top: sliceTopAbsolute - 16, behavior: 'smooth' })
    }
  }, [activeSliceId, slices, displayScale])

  // Check if a design-Y position is valid for a new cut (>= MIN_SLICE_HEIGHT from all existing boundaries)
  const isValidCutPosition = useCallback((designY: number, currentSlices: SliceDefinition[]) => {
    if (designY < MIN_SLICE_HEIGHT || designY > designHeight - MIN_SLICE_HEIGHT) return false
    for (const s of currentSlices) {
      // Check distance from top and bottom edge of each slice
      if (Math.abs(designY - s.y) < MIN_SLICE_HEIGHT) return false
      if (Math.abs(designY - (s.y + s.height)) < MIN_SLICE_HEIGHT) return false
    }
    return true
  }, [designHeight])

  const handleImageMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingDivider !== null || !imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const mouseY = e.clientY - rect.top
    const designY = mouseY / displayScale
    setHoverY(designY)
    setIsHoveringImage(true)
  }, [draggingDivider, displayScale])

  const handleImageMouseLeave = useCallback(() => {
    setHoverY(null)
    setIsHoveringImage(false)
  }, [])

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    if (draggingDivider !== null || !imageContainerRef.current) return
    // Don't handle clicks on dividers or badges (those have stopPropagation, but just in case)
    if ((e.target as HTMLElement).closest('[data-divider]') || (e.target as HTMLElement).closest('[data-badge]')) return

    const rect = imageContainerRef.current.getBoundingClientRect()
    const mouseY = e.clientY - rect.top
    const designY = mouseY / displayScale

    setSlices(prev => {
      if (!isValidCutPosition(designY, prev)) return prev

      // Find which slice this click falls into
      const targetIndex = prev.findIndex(s => designY >= s.y && designY < s.y + s.height)
      if (targetIndex === -1) return prev

      const target = prev[targetIndex]
      const cutOffset = designY - target.y

      // Ensure both resulting slices meet minimum height
      if (cutOffset < MIN_SLICE_HEIGHT || target.height - cutOffset < MIN_SLICE_HEIGHT) return prev

      const topSlice: SliceDefinition = {
        ...target,
        height: cutOffset,
      }

      const newBottomId = generateId()
      const bottomSlice: SliceDefinition = {
        id: newBottomId,
        y: target.y + cutOffset,
        height: target.height - cutOffset,
        ...defaultSliceContentFields(),
      }

      // Make the new bottom slice active
      setTimeout(() => setActiveSliceId(newBottomId), 0)

      const result = [...prev]
      result.splice(targetIndex, 1, topSlice, bottomSlice)
      return result
    })
  }, [draggingDivider, displayScale, isValidCutPosition])

  const removeCut = useCallback((dividerIndex: number) => {
    // dividerIndex is the index of the divider between slices[dividerIndex] and slices[dividerIndex + 1]
    setSlices(prev => {
      if (dividerIndex < 0 || dividerIndex >= prev.length - 1) return prev

      const above = prev[dividerIndex]
      const below = prev[dividerIndex + 1]

      const merged: SliceDefinition = {
        ...above,
        height: above.height + below.height,
      }

      const result = [...prev]
      result.splice(dividerIndex, 2, merged)
      return result
    })
  }, [])

  const handleDividerMouseDown = useCallback((dividerIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingDivider(dividerIndex)
  }, [])

  useEffect(() => {
    if (draggingDivider === null) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!imageContainerRef.current) return

      const rect = imageContainerRef.current.getBoundingClientRect()
      const mouseY = e.clientY - rect.top
      const designY = mouseY / displayScale

      setSlices(prev => {
        const dividerIdx = draggingDivider
        if (dividerIdx < 0 || dividerIdx >= prev.length - 1) return prev

        const above = prev[dividerIdx]
        const below = prev[dividerIdx + 1]
        const combinedTop = above.y
        const combinedBottom = below.y + below.height

        // Clamp to ensure minimum heights
        const newDividerY = Math.max(
          combinedTop + MIN_SLICE_HEIGHT,
          Math.min(combinedBottom - MIN_SLICE_HEIGHT, designY)
        )

        const newAbove: SliceDefinition = {
          ...above,
          height: newDividerY - above.y,
        }

        const newBelow: SliceDefinition = {
          ...below,
          y: newDividerY,
          height: combinedBottom - newDividerY,
        }

        const result = [...prev]
        result[dividerIdx] = newAbove
        result[dividerIdx + 1] = newBelow
        return result
      })
    }

    const handleMouseUp = () => {
      setDraggingDivider(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingDivider, displayScale])

  // Whether the current hover position is a valid place for a cut
  const hoverIsValid = hoverY !== null && isHoveringImage && draggingDivider === null && isValidCutPosition(hoverY, slices)

  const setSliceLayout = useCallback((sliceId: string, layout: SliceColumnLayout) => {
    setSlices(prev => prev.map(s => (s.id === sliceId ? { ...s, type: layout } : s)))
    setActiveColumnTabBySliceId(prev => {
      if (layout === 'full') {
        const next = { ...prev }
        delete next[sliceId]
        return next
      }
      const tab = prev[sliceId] ?? 'left'
      if (layout === 'half' && tab === 'center') {
        return { ...prev, [sliceId]: 'left' }
      }
      return prev
    })
  }, [])

  const setSliceColumnTab = useCallback((sliceId: string, tab: SlicerColumnTab) => {
    setActiveColumnTabBySliceId(prev => ({ ...prev, [sliceId]: tab }))
    setActiveSliceId(sliceId)
  }, [])

  const updateSliceField = useCallback((sliceId: string, field: keyof SliceDefinition, value: string) => {
    setSlices(prev => prev.map(s =>
      s.id === sliceId ? { ...s, [field]: value } : s
    ))
  }, [])

  // Validation: check that all required links are filled
  const missingLinks = useMemo(() => {
    const missing: { sliceId: string; field: string }[] = []
    slices.forEach(s => {
      if (s.type === 'full') {
        if (!s.linkUrl.trim()) missing.push({ sliceId: s.id, field: 'linkUrl' })
      } else if (s.type === 'half') {
        if (!s.leftLinkUrl.trim()) missing.push({ sliceId: s.id, field: 'leftLinkUrl' })
        if (!s.rightLinkUrl.trim()) missing.push({ sliceId: s.id, field: 'rightLinkUrl' })
      } else {
        if (!s.leftLinkUrl.trim()) missing.push({ sliceId: s.id, field: 'leftLinkUrl' })
        if (!s.centerLinkUrl.trim()) missing.push({ sliceId: s.id, field: 'centerLinkUrl' })
        if (!s.rightLinkUrl.trim()) missing.push({ sliceId: s.id, field: 'rightLinkUrl' })
      }
    })
    return missing
  }, [slices])

  const normalizeUrl = (url: string): string => {
    if (!url || url.trim() === '') return ''
    const trimmed = url.trim()
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (/^[a-z]+:/i.test(trimmed)) return trimmed
    return `https://${trimmed}`
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
    setSlices(prev => prev.map(slice => ({
      ...slice,
      linkUrl: applyDomainToLink(slice.linkUrl, targetDomain),
      leftLinkUrl: applyDomainToLink(slice.leftLinkUrl, targetDomain),
      centerLinkUrl: applyDomainToLink(slice.centerLinkUrl, targetDomain),
      rightLinkUrl: applyDomainToLink(slice.rightLinkUrl, targetDomain),
    })))
    setError(null)
  }

  const handleCopyLinkDown = (
    sliceIndex: number,
    field: 'linkUrl' | 'leftLinkUrl' | 'centerLinkUrl' | 'rightLinkUrl'
  ) => {
    const sourceSlice = slices[sliceIndex]
    if (!sourceSlice) return

    const sourceValue = sourceSlice[field]
    if (!sourceValue.trim()) return

    setSlices(prev => prev.map((slice, index) => {
      if (index <= sliceIndex) return slice

      if (field === 'linkUrl') {
        if (slice.type === 'full') {
          if (slice.linkUrl.trim()) return slice
          return { ...slice, linkUrl: sourceValue }
        }
        if (slice.type === 'half') {
          return {
            ...slice,
            leftLinkUrl: slice.leftLinkUrl.trim() ? slice.leftLinkUrl : sourceValue,
            rightLinkUrl: slice.rightLinkUrl.trim() ? slice.rightLinkUrl : sourceValue,
          }
        }
        return {
          ...slice,
          leftLinkUrl: slice.leftLinkUrl.trim() ? slice.leftLinkUrl : sourceValue,
          centerLinkUrl: slice.centerLinkUrl.trim() ? slice.centerLinkUrl : sourceValue,
          rightLinkUrl: slice.rightLinkUrl.trim() ? slice.rightLinkUrl : sourceValue,
        }
      }

      if (slice.type === 'full') {
        if (slice.linkUrl.trim()) return slice
        return { ...slice, linkUrl: sourceValue }
      }

      if (field === 'leftLinkUrl') {
        if (slice.leftLinkUrl.trim()) return slice
        return { ...slice, leftLinkUrl: sourceValue }
      }

      if (field === 'centerLinkUrl') {
        if (slice.type !== 'third' || slice.centerLinkUrl.trim()) return slice
        return { ...slice, centerLinkUrl: sourceValue }
      }

      if (slice.rightLinkUrl.trim()) return slice
      return { ...slice, rightLinkUrl: sourceValue }
    }))
    setError(null)
  }

  const handleContinue = async () => {
    if (missingLinks.length > 0) {
      setShowValidation(true)
      setError(null)
      if (missingLinks[0]) {
        setActiveSliceId(missingLinks[0].sliceId)
      }
      return
    }

    setProcessing(true)
    setError(null)

    try {
      // Load full image into a canvas for cropping
      setProgressMessage('Loading image...')
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image for cropping'))
        img.src = imageUrl
      })

      const imageScale = img.naturalWidth / designWidth
      const leftWidth = Math.floor(img.naturalWidth / 2)
      const rightWidth = img.naturalWidth - leftWidth

      // Crop and upload each slice
      const sliceData: Array<{
        imageUrl: string
        width: number
        name: string
        linkUrl: string
        displayOrder: number
      }> = []

      let displayOrder = 0

      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i]
        setProgressMessage(`Cropping section ${i + 1} of ${slices.length}...`)

        if (slice.type === 'full') {
          const sourceTop = Math.round(slice.y * imageScale)
          const sourceBottom = i === slices.length - 1
            ? img.naturalHeight
            : Math.round((slice.y + slice.height) * imageScale)
          const sourceHeight = Math.max(1, sourceBottom - sourceTop)

          // Full-width: crop entire width
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = sourceHeight
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(
            img,
            0, sourceTop,
            img.naturalWidth, sourceHeight,
            0, 0,
            canvas.width, canvas.height
          )

          setProgressMessage(`Uploading section ${i + 1}...`)
          const blob = await canvasToBlob(downscaleCanvas(canvas))
          const url = await uploadSliceImage(blob, `slice-${displayOrder}`)

          sliceData.push({
            imageUrl: url,
            width: 600,
            name: slice.altText || 'Email section',
            linkUrl: normalizeUrl(slice.linkUrl),
            displayOrder,
          })
          displayOrder++
        } else if (slice.type === 'half') {
          const sourceTop = Math.round(slice.y * imageScale)
          const sourceBottom = i === slices.length - 1
            ? img.naturalHeight
            : Math.round((slice.y + slice.height) * imageScale)
          const sourceHeight = Math.max(1, sourceBottom - sourceTop)

          // Half-width: crop left half and right half separately
          const leftCanvas = document.createElement('canvas')
          leftCanvas.width = leftWidth
          leftCanvas.height = sourceHeight
          const leftCtx = leftCanvas.getContext('2d')!
          leftCtx.drawImage(
            img,
            0, sourceTop,
            leftWidth, sourceHeight,
            0, 0,
            leftWidth, leftCanvas.height
          )

          setProgressMessage(`Uploading section ${i + 1} (left)...`)
          const leftBlob = await canvasToBlob(downscaleCanvas(leftCanvas))
          const leftUrl = await uploadSliceImage(leftBlob, `slice-${displayOrder}`)

          sliceData.push({
            imageUrl: leftUrl,
            width: 300,
            name: slice.leftAltText || 'Left column',
            linkUrl: normalizeUrl(slice.leftLinkUrl),
            displayOrder,
          })
          displayOrder++

          const rightCanvas = document.createElement('canvas')
          rightCanvas.width = rightWidth
          rightCanvas.height = sourceHeight
          const rightCtx = rightCanvas.getContext('2d')!
          rightCtx.drawImage(
            img,
            leftWidth, sourceTop,
            rightWidth, sourceHeight,
            0, 0,
            rightWidth, rightCanvas.height
          )

          setProgressMessage(`Uploading section ${i + 1} (right)...`)
          const rightBlob = await canvasToBlob(downscaleCanvas(rightCanvas))
          const rightUrl = await uploadSliceImage(rightBlob, `slice-${displayOrder}`)

          sliceData.push({
            imageUrl: rightUrl,
            width: 300,
            name: slice.rightAltText || 'Right column',
            linkUrl: normalizeUrl(slice.rightLinkUrl),
            displayOrder,
          })
          displayOrder++
        } else {
          const sourceTop = Math.round(slice.y * imageScale)
          const sourceBottom = i === slices.length - 1
            ? img.naturalHeight
            : Math.round((slice.y + slice.height) * imageScale)
          const sourceHeight = Math.max(1, sourceBottom - sourceTop)

          const nw = img.naturalWidth
          const col1 = Math.floor(nw / 3)
          const col2 = Math.floor(nw / 3)
          const col3 = nw - col1 - col2
          const colWidths = [col1, col2, col3]
          const labels = [
            slice.leftAltText || 'Left column',
            slice.centerAltText || 'Center column',
            slice.rightAltText || 'Right column',
          ] as const
          const linkFields = [slice.leftLinkUrl, slice.centerLinkUrl, slice.rightLinkUrl] as const
          let x = 0
          const colNames = ['left', 'center', 'right'] as const
          for (let c = 0; c < 3; c++) {
            const cw = colWidths[c]
            const colCanvas = document.createElement('canvas')
            colCanvas.width = cw
            colCanvas.height = sourceHeight
            const cctx = colCanvas.getContext('2d')!
            cctx.drawImage(
              img,
              x, sourceTop,
              cw, sourceHeight,
              0, 0,
              cw, colCanvas.height
            )
            setProgressMessage(`Uploading section ${i + 1} (${colNames[c]})...`)
            const colBlob = await canvasToBlob(downscaleCanvas(colCanvas))
            const colUrl = await uploadSliceImage(colBlob, `slice-${displayOrder}`)
            sliceData.push({
              imageUrl: colUrl,
              width: EMAIL_LAYOUT_THREE_COL_CELL_WIDTH,
              name: labels[c],
              linkUrl: normalizeUrl(linkFields[c]),
              displayOrder,
            })
            displayOrder++
            x += cw
          }
        }
      }

      // Finalize: create frame records
      setProgressMessage('Saving sections...')
      const response = await fetch(`/api/campaigns/${campaignId}/finalize-slices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slices: sliceData, sliceLayout: slices }),
      })

      if (!response.ok) {
        let message = 'Failed to save slices'
        try { const data = await response.json(); message = data.error || message } catch {}
        throw new Error(message)
      }

      const { frames: newFrames } = await response.json()
      onComplete(newFrames)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setProcessing(false)
      setProgressMessage(null)
    }
  }

  async function uploadSliceImage(blob: Blob, fileName: string): Promise<string> {
    const formData = new FormData()
    formData.append('image', blob)
    formData.append('projectId', projectId)
    formData.append('fileName', fileName)

    const response = await fetch('/api/frames/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      let message = 'Failed to upload image'
      try { const data = await response.json(); message = data.error || message } catch {}
      throw new Error(message)
    }

    const { url } = await response.json()
    return url
  }

  function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      }, 'image/jpeg', 0.92)
    })
  }

  // Downscale a canvas to max width (2x retina for 600px email) to reduce upload size
  const MAX_UPLOAD_WIDTH = 1200

  function downscaleCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    if (source.width <= MAX_UPLOAD_WIDTH) return source

    const scale = MAX_UPLOAD_WIDTH / source.width
    const dest = document.createElement('canvas')
    dest.width = MAX_UPLOAD_WIDTH
    dest.height = Math.round(source.height * scale)
    const ctx = dest.getContext('2d')!
    ctx.drawImage(source, 0, 0, dest.width, dest.height)
    return dest
  }

  if (!imageUrl) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No image available. Please go back and re-import.</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Back</Button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex gap-6 h-full min-h-[400px]">
      {/* Left: Image with slice dividers */}
      <div className="flex-1 min-w-0 border rounded-xl overflow-hidden flex flex-col">
        <div className="bg-muted px-4 py-3 border-b flex-shrink-0">
          <h2 className="font-medium">Slice your email</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click on the image to add cuts and split into sections
          </p>
        </div>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 bg-muted/50">
          <div
            ref={imageContainerRef}
            className="max-w-[600px] mx-auto relative select-none overflow-hidden"
            style={{ cursor: draggingDivider !== null ? 'row-resize' : hoverIsValid ? 'crosshair' : undefined }}
            onMouseMove={handleImageMouseMove}
            onMouseLeave={handleImageMouseLeave}
            onClick={handleImageClick}
          >
            {/* The full email image */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Full email design"
              className="w-full h-auto block"
              onLoad={handleImageLoad}
              draggable={false}
            />

            {/* Active section overlay */}
            {imageLoaded && slices.map((slice, index) => {
              const topPx = slice.y * displayScale
              const heightPx = slice.height * displayScale
              const isActive = activeSliceId === slice.id
              const columnTab: SlicerColumnTab = activeColumnTabBySliceId[slice.id] ?? 'left'

              return (
                <div
                  key={slice.id}
                  className="absolute left-0 right-0 pointer-events-none transition-opacity duration-150"
                  style={{
                    top: topPx,
                    height: heightPx,
                    backgroundColor:
                      isActive && slice.type === 'full' ? 'rgba(255, 71, 2, 0.15)' : undefined,
                  }}
                >
                  {isActive && slice.type === 'half' && (
                    <div
                      className="absolute top-0 bottom-0"
                      style={{
                        left: columnTab === 'right' ? '50%' : 0,
                        width: '50%',
                        backgroundColor: 'rgba(255, 71, 2, 0.15)',
                      }}
                    />
                  )}
                  {isActive && slice.type === 'third' && (
                    <div
                      className="absolute top-0 bottom-0"
                      style={{
                        left:
                          columnTab === 'left'
                            ? 0
                            : columnTab === 'center'
                              ? '33.33%'
                              : '66.66%',
                        width: columnTab === 'center' ? '33.34%' : '33.33%',
                        backgroundColor: 'rgba(255, 71, 2, 0.15)',
                      }}
                    />
                  )}
                  {/* Slice label */}
                  <div className="absolute top-1 left-1 pointer-events-auto z-[1]" data-badge>
                    <Badge
                      variant={isActive ? 'default' : 'secondary'}
                      className={cn(
                        'text-[10px] cursor-pointer',
                        isActive && 'bg-[#FF4702] hover:bg-[#FF4702]/90'
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveSliceId(slice.id)
                      }}
                    >
                      {index + 1}
                      {slice.type === 'half' ? ' (2 col)' : slice.type === 'third' ? ' (3 col)' : ''}
                    </Badge>
                  </div>

                  {slice.type === 'half' && (
                    <div
                      className="absolute top-0 bottom-0 left-1/2 w-px border-l border-dashed"
                      style={{ borderColor: 'rgba(255, 71, 2, 0.4)' }}
                    />
                  )}
                  {slice.type === 'third' && (
                    <>
                      <div
                        className="absolute top-0 bottom-0 w-px border-l border-dashed"
                        style={{ left: '33.33%', borderColor: 'rgba(255, 71, 2, 0.4)' }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-px border-l border-dashed"
                        style={{ left: '66.66%', borderColor: 'rgba(255, 71, 2, 0.4)' }}
                      />
                    </>
                  )}
                </div>
              )
            })}

            {/* Draggable dividers between slices */}
            {imageLoaded && slices.slice(0, -1).map((slice, index) => {
              const dividerY = (slice.y + slice.height) * displayScale

              return (
                <div
                  key={`divider-${index}`}
                  data-divider
                  className="absolute left-0 right-0 group"
                  style={{
                    top: dividerY - 8,
                    height: 16,
                    cursor: 'row-resize',
                    zIndex: 10,
                  }}
                  onMouseDown={(e) => handleDividerMouseDown(index, e)}
                >
                  {/* Visible line */}
                  <div
                    className="absolute left-0 right-0 top-1/2 -translate-y-px h-[2px] transition-colors"
                    style={{ backgroundColor: 'rgba(255, 71, 2, 0.6)' }}
                  />

                  {/* Grip handle */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full w-6 h-6 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: '#FF4702', color: 'white' }}
                  >
                    <GripHorizontal className="w-3.5 h-3.5" />
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCut(index)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Remove cut"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}

            {/* Hover line for click-to-cut */}
            {hoverIsValid && hoverY !== null && (
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: hoverY * displayScale - 0.5,
                  height: 1,
                  zIndex: 20,
                }}
              >
                <div
                  className="absolute left-0 right-0 top-0 h-[1px] border-t-[2px] border-dashed"
                  style={{ borderColor: '#FF4702' }}
                />
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full w-5 h-5 flex items-center justify-center"
                  style={{ backgroundColor: '#FF4702', color: 'white' }}
                >
                  <Plus className="w-3 h-3" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Slice settings */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="border rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="bg-muted px-4 py-3 border-b flex-shrink-0">
            <h2 className="font-medium">Sections</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {slices.length} section{slices.length !== 1 ? 's' : ''}. Set links and layout for each.
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {slices.map((slice, index) => (
                <div
                  key={slice.id}
                  className={cn(
                    'p-3 cursor-pointer transition-colors',
                    activeSliceId === slice.id ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                  onClick={() => setActiveSliceId(slice.id)}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium flex-1 truncate">
                      Section {index + 1}
                    </span>

                    <div className="flex-shrink-0 w-[132px]" onClick={e => e.stopPropagation()}>
                      <Select
                        value={slice.type}
                        onValueChange={v => setSliceLayout(slice.id, v as SliceColumnLayout)}
                        disabled={processing}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Layout" />
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem value="full">Full width</SelectItem>
                          <SelectItem value="half">2 columns</SelectItem>
                          <SelectItem value="third">3 columns</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Inputs for full-width slice */}
                  {slice.type === 'full' && (
                    <div className="space-y-2 ml-8">
                      <div>
                        <Label className="mb-1 block text-xs text-muted-foreground">Link URL</Label>
                        <div className="relative">
                          <Input
                            type="text"
                            value={slice.linkUrl}
                            onChange={(e) => updateSliceField(slice.id, 'linkUrl', e.target.value)}
                            onBlur={(e) => updateSliceField(slice.id, 'linkUrl', normalizeUrl(e.target.value))}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="google.com or https://..."
                            className={cn(
                              'h-8 pr-16',
                              showValidation && !slice.linkUrl.trim() && 'border-destructive focus-visible:ring-destructive'
                            )}
                            disabled={processing}
                          />
                          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleApplyDomainToAll(slice.linkUrl)
                                  }}
                                  disabled={!slice.linkUrl.trim() || processing}
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
                                    handleCopyLinkDown(index, 'linkUrl')
                                  }}
                                  disabled={!slice.linkUrl.trim() || index === slices.length - 1 || processing}
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
                        {showValidation && !slice.linkUrl.trim() && (
                          <p className="mt-1 text-xs text-destructive">Required</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Alt text</Label>
                        <Input
                          type="text"
                          value={slice.altText}
                          onChange={(e) => updateSliceField(slice.id, 'altText', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Email section"
                          className="h-8"
                          disabled={processing}
                        />
                      </div>
                    </div>
                  )}

                  {slice.type === 'half' && (
                    <div className="ml-8 mt-1" onClick={e => e.stopPropagation()}>
                      <Tabs
                        value={
                          activeColumnTabBySliceId[slice.id] === 'right'
                            ? 'right'
                            : 'left'
                        }
                        onValueChange={v =>
                          setSliceColumnTab(slice.id, v as SlicerColumnTab)
                        }
                        className="w-full"
                      >
                        <TabsList className="grid h-8 w-full grid-cols-2 gap-0.5 p-0.5">
                          <TabsTrigger value="left" className="px-1 text-xs">
                            Left
                          </TabsTrigger>
                          <TabsTrigger value="right" className="px-1 text-xs">
                            Right
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="left" className="mt-2 space-y-2 focus-visible:outline-none">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">Link URL</Label>
                            <div className="relative">
                              <Input
                                type="text"
                                value={slice.leftLinkUrl}
                                onChange={(e) => updateSliceField(slice.id, 'leftLinkUrl', e.target.value)}
                                onBlur={(e) => updateSliceField(slice.id, 'leftLinkUrl', normalizeUrl(e.target.value))}
                                placeholder="google.com or https://..."
                                className={cn(
                                  'h-8 pr-16',
                                  showValidation && !slice.leftLinkUrl.trim() && 'border-destructive focus-visible:ring-destructive'
                                )}
                                disabled={processing}
                              />
                              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyDomainToAll(slice.leftLinkUrl)}
                                      disabled={!slice.leftLinkUrl.trim() || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Apply this link domain to all sections"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Apply this domain to all links</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLinkDown(index, 'leftLinkUrl')}
                                      disabled={!slice.leftLinkUrl.trim() || index === slices.length - 1 || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Copy this link to empty sections below"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Copy to empty links below</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {showValidation && !slice.leftLinkUrl.trim() && (
                              <p className="mt-1 text-xs text-destructive">Required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Alt text</Label>
                            <Input
                              type="text"
                              value={slice.leftAltText}
                              onChange={(e) => updateSliceField(slice.id, 'leftAltText', e.target.value)}
                              placeholder="Left column"
                              className="h-8"
                              disabled={processing}
                            />
                          </div>
                        </TabsContent>
                        <TabsContent value="right" className="mt-2 space-y-2 focus-visible:outline-none">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">Link URL</Label>
                            <div className="relative">
                              <Input
                                type="text"
                                value={slice.rightLinkUrl}
                                onChange={(e) => updateSliceField(slice.id, 'rightLinkUrl', e.target.value)}
                                onBlur={(e) => updateSliceField(slice.id, 'rightLinkUrl', normalizeUrl(e.target.value))}
                                placeholder="google.com or https://..."
                                className={cn(
                                  'h-8 pr-16',
                                  showValidation && !slice.rightLinkUrl.trim() && 'border-destructive focus-visible:ring-destructive'
                                )}
                                disabled={processing}
                              />
                              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyDomainToAll(slice.rightLinkUrl)}
                                      disabled={!slice.rightLinkUrl.trim() || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Apply this link domain to all sections"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Apply this domain to all links</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLinkDown(index, 'rightLinkUrl')}
                                      disabled={!slice.rightLinkUrl.trim() || index === slices.length - 1 || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Copy this link to empty sections below"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Copy to empty links below</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {showValidation && !slice.rightLinkUrl.trim() && (
                              <p className="mt-1 text-xs text-destructive">Required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Alt text</Label>
                            <Input
                              type="text"
                              value={slice.rightAltText}
                              onChange={(e) => updateSliceField(slice.id, 'rightAltText', e.target.value)}
                              placeholder="Right column"
                              className="h-8"
                              disabled={processing}
                            />
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}

                  {slice.type === 'third' && (
                    <div className="ml-8 mt-1" onClick={e => e.stopPropagation()}>
                      <Tabs
                        value={activeColumnTabBySliceId[slice.id] ?? 'left'}
                        onValueChange={v =>
                          setSliceColumnTab(slice.id, v as SlicerColumnTab)
                        }
                        className="w-full"
                      >
                        <TabsList className="grid h-8 w-full grid-cols-3 gap-0.5 p-0.5">
                          <TabsTrigger value="left" className="px-1 text-xs">
                            Left
                          </TabsTrigger>
                          <TabsTrigger value="center" className="px-1 text-xs">
                            Center
                          </TabsTrigger>
                          <TabsTrigger value="right" className="px-1 text-xs">
                            Right
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="left" className="mt-2 space-y-2 focus-visible:outline-none">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">Link URL</Label>
                            <div className="relative">
                              <Input
                                type="text"
                                value={slice.leftLinkUrl}
                                onChange={(e) => updateSliceField(slice.id, 'leftLinkUrl', e.target.value)}
                                onBlur={(e) => updateSliceField(slice.id, 'leftLinkUrl', normalizeUrl(e.target.value))}
                                placeholder="google.com or https://..."
                                className={cn(
                                  'h-8 pr-16',
                                  showValidation && !slice.leftLinkUrl.trim() && 'border-destructive focus-visible:ring-destructive'
                                )}
                                disabled={processing}
                              />
                              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyDomainToAll(slice.leftLinkUrl)}
                                      disabled={!slice.leftLinkUrl.trim() || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Apply this link domain to all sections"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Apply this domain to all links</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLinkDown(index, 'leftLinkUrl')}
                                      disabled={!slice.leftLinkUrl.trim() || index === slices.length - 1 || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Copy this link to empty sections below"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Copy to empty links below</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {showValidation && !slice.leftLinkUrl.trim() && (
                              <p className="mt-1 text-xs text-destructive">Required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Alt text</Label>
                            <Input
                              type="text"
                              value={slice.leftAltText}
                              onChange={(e) => updateSliceField(slice.id, 'leftAltText', e.target.value)}
                              placeholder="Left column"
                              className="h-8"
                              disabled={processing}
                            />
                          </div>
                        </TabsContent>
                        <TabsContent value="center" className="mt-2 space-y-2 focus-visible:outline-none">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">Link URL</Label>
                            <div className="relative">
                              <Input
                                type="text"
                                value={slice.centerLinkUrl}
                                onChange={(e) => updateSliceField(slice.id, 'centerLinkUrl', e.target.value)}
                                onBlur={(e) => updateSliceField(slice.id, 'centerLinkUrl', normalizeUrl(e.target.value))}
                                placeholder="google.com or https://..."
                                className={cn(
                                  'h-8 pr-16',
                                  showValidation && !slice.centerLinkUrl.trim() && 'border-destructive focus-visible:ring-destructive'
                                )}
                                disabled={processing}
                              />
                              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyDomainToAll(slice.centerLinkUrl)}
                                      disabled={!slice.centerLinkUrl.trim() || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Apply this link domain to all sections"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Apply this domain to all links</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLinkDown(index, 'centerLinkUrl')}
                                      disabled={!slice.centerLinkUrl.trim() || index === slices.length - 1 || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Copy this link to empty sections below"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Copy to empty links below</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {showValidation && !slice.centerLinkUrl.trim() && (
                              <p className="mt-1 text-xs text-destructive">Required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Alt text</Label>
                            <Input
                              type="text"
                              value={slice.centerAltText}
                              onChange={(e) => updateSliceField(slice.id, 'centerAltText', e.target.value)}
                              placeholder="Center column"
                              className="h-8"
                              disabled={processing}
                            />
                          </div>
                        </TabsContent>
                        <TabsContent value="right" className="mt-2 space-y-2 focus-visible:outline-none">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">Link URL</Label>
                            <div className="relative">
                              <Input
                                type="text"
                                value={slice.rightLinkUrl}
                                onChange={(e) => updateSliceField(slice.id, 'rightLinkUrl', e.target.value)}
                                onBlur={(e) => updateSliceField(slice.id, 'rightLinkUrl', normalizeUrl(e.target.value))}
                                placeholder="google.com or https://..."
                                className={cn(
                                  'h-8 pr-16',
                                  showValidation && !slice.rightLinkUrl.trim() && 'border-destructive focus-visible:ring-destructive'
                                )}
                                disabled={processing}
                              />
                              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyDomainToAll(slice.rightLinkUrl)}
                                      disabled={!slice.rightLinkUrl.trim() || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Apply this link domain to all sections"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Apply this domain to all links</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLinkDown(index, 'rightLinkUrl')}
                                      disabled={!slice.rightLinkUrl.trim() || index === slices.length - 1 || processing}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                      aria-label="Copy this link to empty sections below"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Copy to empty links below</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {showValidation && !slice.rightLinkUrl.trim() && (
                              <p className="mt-1 text-xs text-destructive">Required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Alt text</Label>
                            <Input
                              type="text"
                              value={slice.rightAltText}
                              onChange={(e) => updateSliceField(slice.id, 'rightAltText', e.target.value)}
                              placeholder="Right column"
                              className="h-8"
                              disabled={processing}
                            />
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="klaviyo-hybrid-dnd-slot-slicer"
                checked={klaviyoHybridDndSlot}
                onCheckedChange={(v) => onKlaviyoHybridDndSlotChange(v === true)}
                disabled={processing}
                className="mt-0.5"
              />
              <div className="space-y-1 min-w-0">
                <Label htmlFor="klaviyo-hybrid-dnd-slot-slicer" className="text-sm font-medium leading-snug cursor-pointer">
                  Add a Klaviyo drag-and-drop section (above footer)
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Inserts a hybrid editor region between your design and the footer so you can add product feeds,
                  universal content, or other blocks in Klaviyo after export.
                </p>
              </div>
            </div>
          </div>

          {showValidation && missingLinks.length > 0 && (
            <p className="text-sm text-destructive">
              {missingLinks.length} link{missingLinks.length === 1 ? '' : 's'} missing.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {progressMessage && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progressMessage}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={processing}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleContinue}
              disabled={processing || !imageLoaded}
              className="flex-1"
            >
              {processing ? 'Processing...' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </TooltipProvider>
  )
}
