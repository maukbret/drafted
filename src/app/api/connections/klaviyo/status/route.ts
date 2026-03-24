import { createClient } from '@/lib/supabase/server'
import { ensureKlaviyoAccountId, getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextResponse } from 'next/server'

interface ConnectionStatus {
  id: string
  status: 'active' | 'expired' | 'error'
  error?: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all Klaviyo connections for this user
    const { data: connections } = await supabase
      .from('klaviyo_connections')
      .select('id, klaviyo_account_id')
      .eq('user_id', user.id)

    if (!connections || connections.length === 0) {
      return NextResponse.json({ statuses: [] })
    }

    // Check each connection in parallel
    const statuses: ConnectionStatus[] = await Promise.all(
      connections.map(async (conn) => {
        try {
          // Get valid token (this will proactively refresh if expiring soon)
          const accessToken = await getValidKlaviyoToken(supabase, conn.id)

          if (!accessToken) {
            return {
              id: conn.id,
              status: 'expired' as const,
              error: 'Token expired and refresh failed',
            }
          }

          const accountId = conn.klaviyo_account_id || await ensureKlaviyoAccountId(supabase, conn.id, {
            accessToken,
          })

          if (accountId) {
            return {
              id: conn.id,
              status: 'active' as const,
            }
          }

          return {
            id: conn.id,
            status: 'error' as const,
            error: 'Connected, but could not resolve the Klaviyo account ID',
          }
        } catch (err) {
          console.error(`Error checking connection ${conn.id}:`, err)
          return {
            id: conn.id,
            status: 'error' as const,
            error: err instanceof Error ? err.message : 'Unknown error',
          }
        }
      })
    )

    return NextResponse.json({ statuses })
  } catch (err) {
    console.error('Status check error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
