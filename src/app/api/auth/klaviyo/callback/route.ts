import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('klaviyo_code_verifier')?.value
  const storedState = cookieStore.get('klaviyo_oauth_state')?.value

  if (error) {
    console.error('Klaviyo OAuth error:', error)
    return NextResponse.redirect(new URL('/dashboard/connections?error=klaviyo_auth_failed', request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/connections?error=no_code', request.url))
  }

  if (!state || state !== storedState) {
    console.error('State mismatch:', { state, storedState })
    return NextResponse.redirect(new URL('/dashboard/connections?error=state_mismatch', request.url))
  }

  if (!codeVerifier) {
    console.error('No code verifier found')
    return NextResponse.redirect(new URL('/dashboard/connections?error=no_code_verifier', request.url))
  }

  try {
    const credentials = Buffer.from(
      `${process.env.KLAVIYO_CLIENT_ID}:${process.env.KLAVIYO_CLIENT_SECRET}`
    ).toString('base64')

    const tokenResponse = await fetch('https://a.klaviyo.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NEXT_PUBLIC_KLAVIYO_REDIRECT_URI!,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Token exchange failed:', errorData)
      throw new Error('Failed to exchange code for token')
    }

    const tokens = await tokenResponse.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Get account name from cookie (set by client before redirect)
    const accountName = cookieStore.get('klaviyo_account_name')?.value || 'Klaviyo Account'

    // Insert new connection (not upsert - we allow multiple)
    const { error: dbError } = await supabase
      .from('klaviyo_connections')
      .insert({
        user_id: user.id,
        account_name: accountName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope,
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save Klaviyo connection')
    }

    const response = NextResponse.redirect(new URL('/dashboard/connections?success=klaviyo_connected', request.url))
    response.cookies.delete('klaviyo_code_verifier')
    response.cookies.delete('klaviyo_oauth_state')
    response.cookies.delete('klaviyo_account_name')
    
    return response
  } catch (err) {
    console.error('Klaviyo callback error:', err)
    return NextResponse.redirect(new URL('/dashboard/connections?error=klaviyo_auth_failed', request.url))
  }
}
