'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'

export interface KlaviyoAccountOption {
  id: string
  account_name: string | null
  owner_name?: string
}

export interface KlaviyoAccountComboboxProps {
  klaviyoConnections: KlaviyoAccountOption[]
  teamConnections?: KlaviyoAccountOption[]
  value: string
  onChange: (connectionId: string) => void
  disabled?: boolean
  id?: string
  triggerClassName?: string
}

export function KlaviyoAccountCombobox({
  klaviyoConnections,
  teamConnections = [],
  value,
  onChange,
  disabled = false,
  id = 'klaviyo-account',
  triggerClassName,
}: KlaviyoAccountComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const allConnections = [...klaviyoConnections, ...teamConnections]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('justify-between font-normal', triggerClassName ?? 'w-full')}
        >
          {value
            ? (() => {
                const conn = allConnections.find((c) => c.id === value)
                if (!conn) return 'Select a Klaviyo account'
                const name = conn.account_name || 'Unnamed account'
                return conn.owner_name ? `${name} (${conn.owner_name})` : name
              })()
            : 'Select a Klaviyo account'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            {klaviyoConnections.length > 0 && (
              <CommandGroup heading={teamConnections.length > 0 ? 'Your accounts' : undefined}>
                {klaviyoConnections.map((conn) => (
                  <CommandItem
                    key={conn.id}
                    value={conn.account_name || 'Unnamed account'}
                    onSelect={() => {
                      onChange(conn.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === conn.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {conn.account_name || 'Unnamed account'}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {teamConnections.length > 0 && (
              <CommandGroup heading="Team accounts">
                {teamConnections.map((conn) => (
                  <CommandItem
                    key={conn.id}
                    value={`${conn.account_name || 'Unnamed account'} ${conn.owner_name || ''}`}
                    onSelect={() => {
                      onChange(conn.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === conn.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span>{conn.account_name || 'Unnamed account'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({conn.owner_name || 'Team'})
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
