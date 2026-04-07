'use client'

import * as React from 'react'
import { CampaignList } from '@/components/campaign-list'
import { CampaignQuickStart } from '@/components/campaign-quick-start'
import { CampaignsHeader } from '@/components/campaigns-header'
import type { KlaviyoAccountOption } from '@/components/klaviyo-account-combobox'
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
  klaviyoConnections,
  teamConnections,
  hasFigmaConnection,
}: {
  hasConnections: boolean
  campaigns: CampaignWithConnection[]
  currentUserId?: string
  defaultKlaviyoConnectionId?: string | null
  isTeamAdmin?: boolean
  klaviyoConnections: KlaviyoAccountOption[]
  teamConnections: KlaviyoAccountOption[]
  hasFigmaConnection: boolean
}) {
  return (
    <div className="relative flex flex-col gap-6">
      <CampaignsHeader hasConnections={hasConnections} />
      <CampaignQuickStart
        klaviyoConnections={klaviyoConnections}
        teamConnections={teamConnections}
        hasFigmaConnection={hasFigmaConnection}
        hasKlaviyoConnection={hasConnections}
        defaultKlaviyoConnectionId={defaultKlaviyoConnectionId ?? null}
      />
      <div className="h-px w-full shrink-0 bg-border" aria-hidden />
      <CampaignList campaigns={campaigns} currentUserId={currentUserId} isTeamAdmin={isTeamAdmin} />
    </div>
  )
}
