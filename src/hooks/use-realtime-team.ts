'use client'

import { useMemo } from 'react'
import { useRealtimeSubscription } from './use-realtime-subscription'

interface UseRealtimeTeamOptions {
  currentUserId: string
  teamId: string | null
}

export function useRealtimeTeam({ currentUserId, teamId }: UseRealtimeTeamOptions) {
  const subscriptions = useMemo(() => {
    if (!teamId) return []
    return [
      { table: 'team_members', events: ['INSERT', 'DELETE'] as const, filter: `team_id=eq.${teamId}` },
      { table: 'team_invitations', events: ['INSERT', 'UPDATE'] as const, filter: `team_id=eq.${teamId}` },
    ]
  }, [teamId])

  useRealtimeSubscription({
    subscriptions,
    currentUserId,
    enabled: !!teamId,
  })
}
