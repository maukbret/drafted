'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Check, ChevronsUpDown, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Audience {
  id: string
  name: string
  type: 'list' | 'segment'
}

interface Form {
  id: string
  name: string
}

function GrowthBadge({ current, comparison }: { current: number; comparison: number }) {
  if (comparison === 0) {
    return current > 0 ? <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">New</Badge> : null
  }
  const pct = ((current - comparison) / comparison) * 100
  const isPositive = pct >= 0
  return (
    <Badge
      variant="outline"
      className={isPositive
        ? 'text-green-600 border-green-200 bg-green-50'
        : 'text-red-600 border-red-200 bg-red-50'
      }
    >
      {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
      {isPositive ? '+' : ''}{pct.toFixed(1)}%
    </Badge>
  )
}

interface ListGrowthProps {
  connectionId: string
  listNetNew: number | null
  compListNetNew: number | null
  formSubmits: number | null
  compFormSubmits: number | null
  selectedListId: string | null
  selectedListName: string | null
  selectedFormId: string | null
  selectedFormName: string | null
  onPreferencesChange: (prefs: {
    selectedListId: string | null
    selectedListName: string | null
    selectedFormId: string | null
    selectedFormName: string | null
  }) => void
  loading?: boolean
}

export function ListGrowth({
  connectionId,
  listNetNew,
  compListNetNew,
  formSubmits,
  compFormSubmits,
  selectedListId,
  selectedListName,
  selectedFormId,
  selectedFormName,
  onPreferencesChange,
  loading,
}: ListGrowthProps) {
  const [lists, setLists] = useState<Audience[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [loadingSelectors, setLoadingSelectors] = useState(false)

  useEffect(() => {
    if (!connectionId) return
    setLoadingSelectors(true)
    Promise.all([
      fetch(`/api/klaviyo/audiences?connectionId=${connectionId}`).then(r => r.json()),
      fetch(`/api/klaviyo/analytics/forms?connectionId=${connectionId}`).then(r => r.json()),
    ]).then(([audiencesData, formsData]) => {
      const listsOnly = (audiencesData.audiences || []).filter((a: Audience) => a.type === 'list')
      setLists(listsOnly)
      setForms(formsData.forms || [])
    }).catch(() => {}).finally(() => setLoadingSelectors(false))
  }, [connectionId])

  return (
    <Card className={cn(loading && 'opacity-50 pointer-events-none')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">List & form growth</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* List selector */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">List</p>
          <Popover open={listOpen} onOpenChange={setListOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={listOpen}
                className="w-full justify-between font-normal"
                disabled={loadingSelectors}
              >
                {selectedListName || 'Select a list...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Search lists..." />
                <CommandList>
                  <CommandEmpty>No lists found.</CommandEmpty>
                  <CommandGroup>
                    {selectedListId && (
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          onPreferencesChange({ selectedListId: null, selectedListName: null, selectedFormId, selectedFormName })
                          setListOpen(false)
                        }}
                      >
                        <span className="text-muted-foreground">Clear selection</span>
                      </CommandItem>
                    )}
                    {lists.map((list) => (
                      <CommandItem
                        key={list.id}
                        value={list.name}
                        onSelect={() => {
                          onPreferencesChange({ selectedListId: list.id, selectedListName: list.name, selectedFormId, selectedFormName })
                          setListOpen(false)
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selectedListId === list.id ? 'opacity-100' : 'opacity-0')} />
                        {list.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedListId && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Net new subscribers</p>
                <p className="text-xl font-bold mt-1">{listNetNew !== null ? (listNetNew >= 0 ? `+${listNetNew}` : listNetNew) : '—'}</p>
                {listNetNew !== null && compListNetNew !== null && (
                  <div className="mt-1">
                    <GrowthBadge current={listNetNew} comparison={compListNetNew} />
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Prior period</p>
                <p className="text-xl font-bold mt-1">{compListNetNew !== null ? (compListNetNew >= 0 ? `+${compListNetNew}` : compListNetNew) : '—'}</p>
              </div>
            </div>
          )}

          {!selectedListId && (
            <p className="text-sm text-muted-foreground">Select a list to see subscriber growth metrics</p>
          )}
        </div>

        {/* Form selector */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Signup form</p>
          <Popover open={formOpen} onOpenChange={setFormOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={formOpen}
                className="w-full justify-between font-normal"
                disabled={loadingSelectors}
              >
                {selectedFormName || 'Select a form...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Search forms..." />
                <CommandList>
                  <CommandEmpty>No forms found.</CommandEmpty>
                  <CommandGroup>
                    {selectedFormId && (
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          onPreferencesChange({ selectedListId, selectedListName, selectedFormId: null, selectedFormName: null })
                          setFormOpen(false)
                        }}
                      >
                        <span className="text-muted-foreground">Clear selection</span>
                      </CommandItem>
                    )}
                    {forms.map((form) => (
                      <CommandItem
                        key={form.id}
                        value={form.name}
                        onSelect={() => {
                          onPreferencesChange({ selectedListId, selectedListName, selectedFormId: form.id, selectedFormName: form.name })
                          setFormOpen(false)
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selectedFormId === form.id ? 'opacity-100' : 'opacity-0')} />
                        {form.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedFormId && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Form submits</p>
                <p className="text-xl font-bold mt-1">{formSubmits !== null ? formSubmits.toLocaleString() : '—'}</p>
                {formSubmits !== null && compFormSubmits !== null && (
                  <div className="mt-1">
                    <GrowthBadge current={formSubmits} comparison={compFormSubmits} />
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Prior period</p>
                <p className="text-xl font-bold mt-1">{compFormSubmits !== null ? compFormSubmits.toLocaleString() : '—'}</p>
              </div>
            </div>
          )}

          {!selectedFormId && (
            <p className="text-sm text-muted-foreground">Select a form to see submission metrics</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
