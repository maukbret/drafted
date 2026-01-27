'use client'

import { useState, useEffect } from 'react'
import { KlaviyoAudience } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, X, Loader2 } from 'lucide-react'

interface AudienceSelectorProps {
  connectionId: string
  selectedAudiences: KlaviyoAudience[]
  onChange: (audiences: KlaviyoAudience[]) => void
  label?: string
  placeholder?: string
}

export function AudienceSelector({
  connectionId,
  selectedAudiences,
  onChange,
  label = 'Audiences',
  placeholder = 'Select audiences...',
}: AudienceSelectorProps) {
  const [audiences, setAudiences] = useState<KlaviyoAudience[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchAudiences = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/klaviyo/audiences?connectionId=${connectionId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch audiences')
        }

        const data = await response.json()
        setAudiences(data.audiences || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audiences')
      } finally {
        setLoading(false)
      }
    }

    if (connectionId) {
      fetchAudiences()
    }
  }, [connectionId])

  const filteredAudiences = audiences.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleAudience = (audience: KlaviyoAudience) => {
    const isSelected = selectedAudiences.some((a) => a.id === audience.id)
    if (isSelected) {
      onChange(selectedAudiences.filter((a) => a.id !== audience.id))
    } else {
      onChange([...selectedAudiences, audience])
    }
  }

  const removeAudience = (audienceId: string) => {
    onChange(selectedAudiences.filter((a) => a.id !== audienceId))
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading audiences...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="px-3 py-2 border border-destructive/50 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-2">
      <Label>{label}</Label>

      {/* Selected audiences */}
      {selectedAudiences.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedAudiences.map((audience) => (
            <Badge
              key={audience.id}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className={cn(
                'w-2 h-2 rounded-full',
                audience.type === 'list' ? 'bg-blue-500' : 'bg-purple-500'
              )} />
              {audience.name}
              <button
                type="button"
                onClick={() => removeAudience(audience.id)}
                className="ml-1 hover:bg-muted-foreground/20 rounded p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between font-normal"
      >
        <span className="text-muted-foreground">{placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audiences..."
              className="h-8"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredAudiences.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No audiences found</div>
            ) : (
              filteredAudiences.map((audience) => {
                const isSelected = selectedAudiences.some((a) => a.id === audience.id)
                return (
                  <button
                    key={audience.id}
                    type="button"
                    onClick={() => toggleAudience(audience)}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted',
                      isSelected && 'bg-muted/50'
                    )}
                  >
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      audience.type === 'list' ? 'bg-blue-500' : 'bg-purple-500'
                    )} />
                    <span className="flex-1">{audience.name}</span>
                    <span className="text-xs text-muted-foreground">{audience.type}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
