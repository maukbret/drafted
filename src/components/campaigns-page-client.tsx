'use client'

import * as React from 'react'
import { CampaignList } from '@/components/campaign-list'
import { CampaignsHeader } from '@/components/campaigns-header'
import type { Campaign } from '@/types/database'

interface CampaignWithConnection extends Campaign {
  klaviyo_connections?: { account_name: string | null } | null
  profiles?: { full_name: string | null } | null
  is_own?: boolean
  creator_name?: string | null
}

export function CampaignsPageClient({
  hasConnections,
  campaigns,
  currentUserId,
}: {
  hasConnections: boolean
  campaigns: CampaignWithConnection[]
  currentUserId?: string
}) {
  const [searchQuery, setSearchQuery] = React.useState('')

  return (
    <>
      <CampaignsHeader
        hasConnections={hasConnections}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      <CampaignList campaigns={campaigns} searchQuery={searchQuery} currentUserId={currentUserId} />
    </>
  )
}