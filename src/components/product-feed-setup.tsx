'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProductFeedSetupProps {
  connectionId: string
  hasPreset: boolean
  onComplete: () => void
  onCancel: () => void
}

type Layout = '1-column' | '2-column' | '3-column'
type ImageRatio = 'square' | 'original'

const LAYOUT_OPTIONS: { value: Layout; label: string; cols: number }[] = [
  { value: '1-column', label: '1 Column', cols: 1 },
  { value: '2-column', label: '2 Columns', cols: 2 },
  { value: '3-column', label: '3 Columns', cols: 3 },
]

export function ProductFeedSetup({ connectionId, hasPreset, onComplete, onCancel }: ProductFeedSetupProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [layout, setLayout] = useState<Layout>('2-column')
  const [buttonColor, setButtonColor] = useState('#000000')
  const [buttonTextColor, setButtonTextColor] = useState('#ffffff')
  const [buttonText, setButtonText] = useState('Shop now')
  const [showPrice, setShowPrice] = useState(true)
  const [showTitle, setShowTitle] = useState(true)
  const [imageRatio, setImageRatio] = useState<ImageRatio>('square')

  useEffect(() => {
    if (!hasPreset) {
      setLoading(false)
      return
    }

    let isActive = true

    const fetchPreset = async () => {
      try {
        const response = await fetch(`/api/klaviyo/product-feed-preset?connectionId=${connectionId}`)
        const data = await response.json()

        if (!isActive) return

        if (data.preset) {
          setLayout(data.preset.layout || '2-column')
          setButtonColor(data.preset.button_color || '#000000')
          setButtonTextColor(data.preset.button_text_color || '#ffffff')
          setButtonText(data.preset.button_text || 'Shop now')
          setShowPrice(data.preset.show_price ?? true)
          setShowTitle(data.preset.show_title ?? true)
          setImageRatio(data.preset.image_ratio || 'square')
        }
      } catch {
        if (isActive) setError('Failed to load preset')
      } finally {
        if (isActive) setLoading(false)
      }
    }

    fetchPreset()
    return () => { isActive = false }
  }, [connectionId, hasPreset])

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/klaviyo/product-feed-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          layout,
          buttonColor,
          buttonTextColor,
          buttonText: buttonText.trim() || 'Shop now',
          showPrice,
          showTitle,
          imageRatio,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const cols = layout === '1-column' ? 1 : layout === '2-column' ? 2 : 3
  const colWidth = Math.floor(600 / cols)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hasPreset ? 'Edit product feed style' : 'Set up product feed'}</DialogTitle>
          <DialogDescription>
            Configure how products appear in your emails. The feed name is set per campaign.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 mt-2">
            {/* Layout selector */}
            <div className="space-y-2">
              <Label>Layout</Label>
              <div className="grid grid-cols-3 gap-3">
                {LAYOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLayout(option.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors',
                      layout === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/30'
                    )}
                  >
                    <div className="flex gap-1">
                      {Array.from({ length: option.cols }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'rounded bg-muted-foreground/20',
                            option.cols === 1 ? 'w-12 h-14' : option.cols === 2 ? 'w-8 h-10' : 'w-6 h-8'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Button styling */}
            <div className="space-y-3">
              <Label>Button</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Text</Label>
                  <Input
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="Shop now"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={buttonColor}
                      onChange={(e) => setButtonColor(e.target.value)}
                      className="h-9 w-9 rounded border cursor-pointer"
                    />
                    <Input
                      value={buttonColor}
                      onChange={(e) => setButtonColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Text color</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={buttonTextColor}
                      onChange={(e) => setButtonTextColor(e.target.value)}
                      className="h-9 w-9 rounded border cursor-pointer"
                    />
                    <Input
                      value={buttonTextColor}
                      onChange={(e) => setButtonTextColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <Label>Display options</Label>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-title"
                    checked={showTitle}
                    onCheckedChange={(checked) => setShowTitle(checked as boolean)}
                  />
                  <label htmlFor="show-title" className="text-sm">Show product title</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-price"
                    checked={showPrice}
                    onCheckedChange={(checked) => setShowPrice(checked as boolean)}
                  />
                  <label htmlFor="show-price" className="text-sm">Show price</label>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Image ratio</Label>
                <div className="flex gap-3">
                  {(['square', 'original'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setImageRatio(ratio)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors',
                        imageRatio === ratio
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/30'
                      )}
                    >
                      <div className={cn(
                        'bg-muted-foreground/20 rounded',
                        ratio === 'square' ? 'w-5 h-5' : 'w-5 h-7'
                      )} />
                      {ratio === 'square' ? 'Square' : 'Original'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-lg border bg-white p-4 overflow-x-auto">
                <div className="mx-auto" style={{ maxWidth: 400 }}>
                  <div className="flex flex-wrap justify-center gap-2">
                    {Array.from({ length: Math.min(cols, 3) }).map((_, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center"
                        style={{ width: Math.min(colWidth, 400 / cols) - 8 }}
                      >
                        <div
                          className="w-full bg-gray-100 rounded"
                          style={{
                            aspectRatio: imageRatio === 'square' ? '1' : '3/4',
                          }}
                        />
                        {showTitle && (
                          <p className="text-xs font-semibold mt-2 text-center text-gray-800">Product Title</p>
                        )}
                        {showPrice && (
                          <p className="text-xs text-gray-500 mt-0.5">$29.99</p>
                        )}
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold px-4 py-1.5 rounded"
                          style={{
                            backgroundColor: buttonColor,
                            color: buttonTextColor,
                          }}
                        >
                          {buttonText || 'Shop now'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : hasPreset ? 'Update style' : 'Save style'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
