import { createClient } from '@/lib/supabase/server'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
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
      .select('id')
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

          // Validate the token by calling Klaviyo API
          const accountResponse = await fetch('https://a.klaviyo.com/api/accounts/', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
              'revision': '2026-01-15',
            },
          })

          if (accountResponse.ok) {
            return {
              id: conn.id,
              status: 'active' as const,
            }
          } else if (accountResponse.status === 401) {
            return {
              id: conn.id,
              status: 'expired' as const,
              error: 'Token invalid or revoked',
            }
          } else {
            return {
              id: conn.id,
              status: 'error' as const,
              error: `API error: ${accountResponse.status}`,
            }
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
