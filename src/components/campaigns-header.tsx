'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

interface CampaignsHeaderProps {
  hasConnections: boolean
}

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      })

      if (response.ok) {
        await response.json().catch(() => null)
        return
      }
    } catch (err) {
      console.error('Failed to sync statuses:', err)
    } finally {
      setIsRefreshing(false)
      setLastRefresh(new Date())
      // Always refresh the page data so internal changes (names, accounts, etc.)
      // show up even if the Klaviyo sync fails.
      router.refresh()
    }
  }, [isRefreshing, router])

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create and send email campaigns through Klaviyo
        </p>
      </div>

      <div className="flex items-center gap-2">
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

        {hasConnections ? null : (
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
