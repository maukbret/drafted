'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type EventType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimeSubscriptionConfig {
  table: string
  events: readonly EventType[]
  filter?: string
}

interface UseRealtimeSubscriptionOptions {
  subscriptions: RealtimeSubscriptionConfig[]
  currentUserId: string
  onExternalChange?: () => void
  debounceMs?: number
  enabled?: boolean
}

export function useRealtimeSubscription({
  subscriptions,
  currentUserId,
  onExternalChange,
  debounceMs = 500,
  enabled = true,
}: UseRealtimeSubscriptionOptions) {
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onExternalChangeRef = useRef(onExternalChange)
  onExternalChangeRef.current = onExternalChange

  useEffect(() => {
    if (!enabled || subscriptions.length === 0) return

    const supabase = createClient()
    const channelName = `realtime-${subscriptions.map(s => s.table).join('-')}-${Date.now()}`
    let channel = supabase.channel(channelName)

    for (const sub of subscriptions) {
      for (const event of sub.events) {
        const config: Record<string, string> = {
          event,
          schema: 'public',
          table: sub.table,
        }
        if (sub.filter) {
          config.filter = sub.filter
        }

        channel = channel.on(
          'postgres_changes' as any,
          config,
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            // Skip changes made by the current user
            const record = (payload.new ?? payload.old) as Record<string, unknown> | undefined
            if (record && record.user_id === currentUserId) return

            // Optional side-effect callback (e.g. refetch local state)
            onExternalChangeRef.current?.()

            // Debounced router.refresh()
            if (debounceRef.current) {
              clearTimeout(debounceRef.current)
            }
            debounceRef.current = setTimeout(() => {
              router.refresh()
            }, debounceMs)
          },
        )
      }
    }

    channel.subscribe()

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- subscriptions array must be memoized by caller
  }, [enabled, currentUserId, debounceMs, subscriptions])
}
