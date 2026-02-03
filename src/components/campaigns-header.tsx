'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, RefreshCw, Search, X } from 'lucide-react'

interface CampaignsHeaderProps {
  hasConnections: boolean
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}

// Auto-refresh interval: 60 seconds
const AUTO_REFRESH_INTERVAL = 60 * 1000

export function CampaignsHeader({
  hasConnections,
  searchQuery,
  onSearchQueryChange,
}: CampaignsHeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const router = useRouter()

  const syncStatuses = useCallback(async () => {
    if (isRefreshing) return

    setIsRefreshing(true)

    try {
      const response = await fetch('/api/campaigns/sync-status', {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Sync result:', data)

        if (data.updated > 0) {
          router.refresh()
        }
      }
    } catch (err) {
      console.error('Failed to sync statuses:', err)
    } finally {
      setIsRefreshing(false)
      setLastRefresh(new Date())
    }
  }, [isRefreshing, router])

  useEffect(() => {
    syncStatuses()

    const interval = setInterval(() => {
      syncStatuses()
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSearchOpen) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [isSearchOpen])

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    onSearchQueryChange('')
  }, [onSearchQueryChange])

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create and send email campaigns through Klaviyo
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Expanding search */}
        <div className="flex items-center">
          <div
            className={[
              'overflow-visible transition-all duration-200 ease-out',
              isSearchOpen ? 'w-72 mr-2' : 'w-0 mr-0',
            ].join(' ')}
          >
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search campaigns..."
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSearch()
              }}
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => {
              if (isSearchOpen) {
                closeSearch()
              } else {
                setIsSearchOpen(true)
              }
            }}
            aria-label={isSearchOpen ? 'Close search' : 'Open search'}
            title={isSearchOpen ? 'Close search' : 'Search campaigns'}
          >
            {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {/* Sync */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => syncStatuses()}
          disabled={isRefreshing}
          title={lastRefresh ? `Last synced: ${lastRefresh.toLocaleTimeString()}` : 'Sync statuses from Klaviyo'}
          className="h-9 w-9"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>

        {/* Primary action */}
        {hasConnections ? (
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4 buttonIcon" />
              New campaign
            </Link>
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/connections">
              Connect Klaviyo first
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}