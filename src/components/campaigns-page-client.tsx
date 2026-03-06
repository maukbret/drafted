'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CampaignList } from '@/components/campaign-list'
import { CampaignsHeader } from '@/components/campaigns-header'
import { useRealtimeCampaigns } from '@/hooks/use-realtime-campaigns'
import type { Campaign } from '@/types/database'

interface CampaignWithConnection extends Campaign {
  klaviyo_connections?: { account_name: string | null; store_url?: string | null } | null
  profiles?: { full_name: string | null } | null
  is_own?: boolean
  creator_name?: string | null
  creator_avatar_url?: string | null
}

export function CampaignsPageClient({
  hasConnections,
  campaigns,
  currentUserId,
  defaultKlaviyoConnectionId,
  isTeamAdmin,
}: {
  hasConnections: boolean
  campaigns: CampaignWithConnection[]
  currentUserId?: string
  defaultKlaviyoConnectionId?: string | null
  isTeamAdmin?: boolean
}) {
  const [isCreating, setIsCreating] = React.useState(false)
  const router = useRouter()

  useRealtimeCampaigns({ currentUserId: currentUserId || '' })

  const handleCreateCampaign = React.useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klaviyoConnectionId: defaultKlaviyoConnectionId }),
      })

      let payload: any = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (response.ok && payload?.campaign?.id) {
        router.push(`/campaigns/${payload.campaign.id}`)
        return
      }

      if (payload?.code === 'missing_figma_connection' || payload?.code === 'missing_klaviyo_connection') {
        router.push('/connections')
        return
      }

      alert(payload?.error || 'Failed to create campaign')
    } catch (err) {
      console.error('Failed to create campaign:', err)
      alert('Failed to create campaign')
    } finally {
      setIsCreating(false)
    }
  }, [defaultKlaviyoConnectionId, isCreating, router])

  return (
    <div className="relative">
      <CampaignsHeader
        hasConnections={hasConnections}
        onCreateCampaign={handleCreateCampaign}
        isCreating={isCreating}
      />
      <CampaignList campaigns={campaigns} currentUserId={currentUserId} isTeamAdmin={isTeamAdmin} />
      {isCreating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
        </div>
      )}
    </div>
  )
}
