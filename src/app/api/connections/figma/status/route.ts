import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type ConnectionStatus = 'active' | 'expired' | 'error'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: connection } = await supabase
      .from('figma_connections')
      .select('id, access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ status: null })
    }

    let figmaToken = connection.access_token
    const expiresAt = new Date(connection.expires_at)
    const now = new Date()

    if (expiresAt <= now) {
      if (!connection.refresh_token) {
        return NextResponse.json({
          status: { id: connection.id, status: 'expired' as const, error: 'Token expired' },
        })
      }

      const refreshResponse = await fetch('https://api.figma.com/v1/oauth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.FIGMA_CLIENT_ID!,
          client_secret: process.env.FIGMA_CLIENT_SECRET!,
          refresh_token: connection.refresh_token,
        }),
      })

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json()
        figmaToken = tokens.access_token

        await supabase
          .from('figma_connections')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || connection.refresh_token,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('user_id', user.id)
      } else {
        console.error('Failed to refresh Figma token:', await refreshResponse.text())
        return NextResponse.json({
          status: { id: connection.id, status: 'expired' as const, error: 'Token refresh failed' },
        })
      }
    }

    const userResponse = await fetch('https://api.figma.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${figmaToken}`,
      },
    })

    if (userResponse.ok) {
      return NextResponse.json({ status: { id: connection.id, status: 'active' as const } })
    }

    if (userResponse.status === 401) {
      return NextResponse.json({
        status: { id: connection.id, status: 'expired' as const, error: 'Token invalid or revoked' },
      })
    }

    // Some Figma tokens are scoped to file access only and cannot call /v1/me.
    // If we get a 403, treat the connection as active to avoid false errors.
    if (userResponse.status === 403) {
      return NextResponse.json({ status: { id: connection.id, status: 'active' as const } })
    }

    return NextResponse.json({
      status: { id: connection.id, status: 'error' as const, error: `API error: ${userResponse.status}` },
    })
  } catch (err) {
    console.error('Figma status check error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
