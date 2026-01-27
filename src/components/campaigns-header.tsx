'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'

interface CampaignsHeaderProps {
  hasConnections: boolean
}

// Auto-refresh interval: 60 seconds
const AUTO_REFRESH_INTERVAL = 60 * 1000

export function CampaignsHeader({ hasConnections }: CampaignsHeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
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

        // Refresh the page to show updated statuses
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

  // Auto-refresh on interval
  useEffect(() => {
    // Initial sync on mount
    syncStatuses()

    // Set up interval for auto-refresh
    const interval = setInterval(() => {
      syncStatuses()
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create and send email campaigns through Klaviyo
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => syncStatuses()}
          disabled={isRefreshing}
          title={lastRefresh ? `Last synced: ${lastRefresh.toLocaleTimeString()}` : 'Sync statuses from Klaviyo'}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>

        {hasConnections ? (
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4 mr-1.5" />
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
