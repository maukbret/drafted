'use client'

import { useMemo } from 'react'
import { useRealtimeSubscription } from './use-realtime-subscription'

export function useRealtimeCampaigns({ currentUserId }: { currentUserId: string }) {
  const subscriptions = useMemo(() => [
    { table: 'campaigns', events: ['INSERT', 'UPDATE', 'DELETE'] as const },
  ], [])

  useRealtimeSubscription({ subscriptions, currentUserId })
}
