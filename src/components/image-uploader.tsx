'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Check, Copy, Upload, Info } from 'lucide-react'
import { toast } from 'sonner'

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

  const showStreamErrorToast = (data: Record<string, unknown>) => {
    const message = typeof data?.message === 'string' ? data.message : 'An error occurred'

    if (data?.code === 'figma_rate_limited') {
      const description = typeof data?.retryAt === 'string'
        ? `Try again after ${new Date(data.retryAt).toLocaleString()}.`
        : undefined
      const upgradeUrl = typeof data?.upgradeUrl === 'string' ? data.upgradeUrl : ''

      toast.error(message, {
        description,
        action: upgradeUrl
          ? {
              label: 'Upgrade options',
              onClick: () => window.open(upgradeUrl, '_blank'),
            }
          : undefined,
      })
      return
    }

    toast.error(message)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!figmaUrl.trim()) {
      const message = 'Please enter a Figma URL'
      setError(message)
      toast.error(message)
      return
    }

    if (!selectedKlaviyoId) {
      const message = 'Please select a Klaviyo account'
      setError(message)
      toast.error(message)
      return
    }

    setLoading(true)
    setError(null)
    setUploadedImages([])
    setProgress('Processing Figma file...')
    let streamErrorToastShown = false

    try {
      if (!figmaUrl.includes('figma.com/design/')) {
        const message = 'Please enter a valid Figma design URL'
        toast.error(message)
        throw new Error(message)
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
            } else if (data.type === 'warning') {
              if (typeof data.message === 'string') {
                toast.warning(data.message)
              }
            } else if (data.type === 'image') {
              images.push({
                name: data.name,
                originalUrl: data.originalUrl,
                klaviyoUrl: data.klaviyoUrl,
                copied: false,
              })
              setUploadedImages([...images])
            } else if (data.type === 'error') {
              streamErrorToastShown = true
              showStreamErrorToast(data)
              throw new Error(typeof data.message === 'string' ? data.message : 'An error occurred')
            } else if (data.type === 'done') {
              setProgress(null)
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.error('Failed to parse line:', line, e)
            } else {
              throw e
            }
          }
        }
      }

      if (buffer.trim()) {
        let data: Record<string, unknown> | null = null
        try {
          data = JSON.parse(buffer)
        } catch (e) {
          console.error('Failed to parse final buffer:', buffer, e)
        }

        if (data?.type === 'warning' && typeof data.message === 'string') {
          toast.warning(data.message)
        } else if (data?.type === 'error') {
          streamErrorToastShown = true
          showStreamErrorToast(data)
          throw new Error(typeof data.message === 'string' ? data.message : 'An error occurred')
        }
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      if (!streamErrorToastShown) {
        toast.error(message)
      }
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
    <div className="space-y-6 max-w-2xl">
      {/* Upload form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="klaviyo-account">Klaviyo account</Label>
          <Select
            value={selectedKlaviyoId}
            onValueChange={setSelectedKlaviyoId}
            disabled={loading}
          >
            <SelectTrigger id="klaviyo-account">
              <SelectValue placeholder="Select a Klaviyo account" />
            </SelectTrigger>
            <SelectContent>
              {klaviyoConnections.map((conn) => (
                <SelectItem key={conn.id} value={conn.id}>
                  {conn.account_name || 'Unnamed account'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="figma-url">Figma URL</Label>
          <Input
            id="figma-url"
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/..."
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Copy the link to your email design frame in Figma (must include node-id)
          </p>
        </div>

        <div className="flex gap-3 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">Your email must be built with separate sections.</span>{' '}
            This tool looks at the child frames inside the frame you link — each child frame becomes one image uploaded to Klaviyo.
            If your email isn&apos;t designed with distinct sections (e.g. header, hero, footer as separate frames),
            you&apos;ll end up with random or unusable images in your account.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {progress && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading || !figmaUrl.trim() || !selectedKlaviyoId}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload images to Klaviyo
            </>
          )}
        </Button>
      </form>

      {/* Uploaded images */}
      {uploadedImages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Uploaded images ({uploadedImages.length})</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyAllUrls}>
                <Copy className="h-4 w-4 mr-2" />
                Copy all URLs
              </Button>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Upload more
              </Button>
            </div>
          </div>
          {uploadedImages.map((image, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-3 bg-muted rounded-lg"
            >
              <div className="w-16 h-16 flex-shrink-0 bg-muted-foreground/10 rounded overflow-hidden">
                <img
                  src={image.klaviyoUrl}
                  alt={image.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{image.name}</p>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {image.klaviyoUrl}
                </p>
              </div>
              <Button
                variant={image.copied ? 'default' : 'secondary'}
                size="sm"
                onClick={() => copyToClipboard(image.klaviyoUrl, index)}
                className={image.copied ? 'bg-green-600 hover:bg-green-600' : ''}
              >
                {image.copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  'Copy URL'
                )}
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            Use these URLs in Klaviyo&apos;s drag &amp; drop editor or in dynamic content blocks.
          </p>
        </div>
      )}
    </div>
  )
}
