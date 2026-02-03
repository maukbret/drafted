'use client'

import { useState, useEffect } from 'react'
import { KlaviyoAudience } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, X } from 'lucide-react'

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
  const [open, setOpen] = useState(false)

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
        <Skeleton className="h-9 w-full" />
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
    <div className="space-y-2">
      <Label>{label}</Label>

      {/* Selected audiences */}
      {selectedAudiences.length > 0 && (
        <div className="flex flex-wrap gap-2">
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

      {/* Popover with Command */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">{placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search audiences..." />
            <CommandList>
              <CommandEmpty>No audiences found.</CommandEmpty>
              <CommandGroup>
                {audiences.map((audience) => {
                  const isSelected = selectedAudiences.some((a) => a.id === audience.id)
                  return (
                    <CommandItem
                      key={audience.id}
                      value={audience.name}
                      onSelect={() => toggleAudience(audience)}
                    >
                      <span className={cn(
                        'w-2 h-2 rounded-full mr-2',
                        audience.type === 'list' ? 'bg-blue-500' : 'bg-purple-500'
                      )} />
                      <span className="flex-1">{audience.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{audience.type}</span>
                      <Check
                        className={cn(
                          'h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
