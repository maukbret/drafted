import { createClient } from '@/lib/supabase/server'
import { fetchKlaviyoAccountId } from '@/lib/klaviyo'
import { userCanManageKlaviyoConnectionSettings } from '@/lib/klaviyo-connection-access'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateStoreUrl } from '@/lib/store-url'

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
    return NextResponse.redirect(new URL('/connections?error=klaviyo_auth_failed', request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/connections?error=no_code', request.url))
  }

  if (!state || state !== storedState) {
    console.error('State mismatch:', { state, storedState })
    return NextResponse.redirect(new URL('/connections?error=state_mismatch', request.url))
  }

  if (!codeVerifier) {
    console.error('No code verifier found')
    return NextResponse.redirect(new URL('/connections?error=no_code_verifier', request.url))
  }

  try {
    const decodeCookieValue = (value: string | undefined) => {
      if (!value) return ''
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }

    const clientId = process.env.KLAVIYO_CLIENT_ID || process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID
    const clientSecret = process.env.KLAVIYO_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('Missing Klaviyo client credentials')
      return NextResponse.redirect(new URL('/connections?error=missing_credentials', request.url))
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

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

    const reconnectConnectionId = cookieStore.get('klaviyo_reconnect_connection_id')?.value

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    const isOnboarding = !profile?.onboarding_completed
    const failedLookupPath = isOnboarding
      ? '/onboarding?step=klaviyo&error=klaviyo_account_lookup_failed'
      : '/connections?error=klaviyo_account_lookup_failed'

    const klaviyoAccountId = await fetchKlaviyoAccountId(tokens.access_token)

    if (!klaviyoAccountId) {
      console.error('Failed to fetch Klaviyo account ID during OAuth callback')
      return NextResponse.redirect(new URL(failedLookupPath, request.url))
    }

    if (reconnectConnectionId) {
      const { data: existing } = await supabase
        .from('klaviyo_connections')
        .select('id, user_id, store_url')
        .eq('id', reconnectConnectionId)
        .single()

      if (!existing) {
        return NextResponse.redirect(new URL('/connections?error=reconnect_not_found', request.url))
      }

      const allowed = await userCanManageKlaviyoConnectionSettings(supabase, user.id, existing.user_id)
      if (!allowed) {
        return NextResponse.redirect(new URL('/connections?error=reconnect_forbidden', request.url))
      }

      const reconnectStoreValidation = validateStoreUrl(existing.store_url || '')
      if (!reconnectStoreValidation.valid) {
        return NextResponse.redirect(new URL('/connections?error=invalid_store_url', request.url))
      }

      const { error: updateError } = await supabase
        .from('klaviyo_connections')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          scope: tokens.scope,
          klaviyo_account_id: klaviyoAccountId,
        })
        .eq('id', reconnectConnectionId)

      if (updateError) {
        console.error('Klaviyo reconnect update error:', updateError)
        return NextResponse.redirect(new URL('/connections?error=klaviyo_auth_failed', request.url))
      }

      const reconnectResponse = NextResponse.redirect(new URL('/connections?success=klaviyo_reconnected', request.url))
      reconnectResponse.cookies.delete('klaviyo_code_verifier')
      reconnectResponse.cookies.delete('klaviyo_oauth_state')
      reconnectResponse.cookies.delete('klaviyo_reconnect_connection_id')
      reconnectResponse.cookies.delete('klaviyo_account_name')
      reconnectResponse.cookies.delete('klaviyo_store_url')
      reconnectResponse.cookies.delete('klaviyo_is_shared')
      return reconnectResponse
    }

    // Get account details from cookies (set by client before redirect)
    const accountNameCookie = decodeCookieValue(cookieStore.get('klaviyo_account_name')?.value)
    const accountName = accountNameCookie || 'Klaviyo Account'
    const storeUrlCookie = decodeCookieValue(cookieStore.get('klaviyo_store_url')?.value)
    const isSharedCookie = cookieStore.get('klaviyo_is_shared')?.value
    const isShared = isSharedCookie === '1'
    const storeUrlValidation = validateStoreUrl(storeUrlCookie)

    if (!storeUrlValidation.valid) {
      return NextResponse.redirect(new URL('/connections?error=invalid_store_url', request.url))
    }

    // Check subscription tier and connection limits
    // During onboarding, allow 1 connection regardless of subscription
    if (!isOnboarding) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('price_tier')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing'])
        .single()

      // Get connection limit based on tier
      const tierLimits: Record<string, number> = {
        starter: 1,
        advanced: 5,
        pro: 20,
      }
      const connectionLimit = subscription?.price_tier
        ? tierLimits[subscription.price_tier] || 0
        : 0

      // Count existing connections
      const { count: existingConnections } = await supabase
        .from('klaviyo_connections')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const currentCount = existingConnections || 0

      // Check if at limit
      if (currentCount >= connectionLimit) {
        console.log(`User ${user.id} at connection limit: ${currentCount}/${connectionLimit}`)
        return NextResponse.redirect(new URL('/connections?error=limit_reached', request.url))
      }
    } else {
      // During onboarding, check we don't already have a connection
      const { count: existingConnections } = await supabase
        .from('klaviyo_connections')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const currentCount = existingConnections || 0
      if (currentCount >= 1) {
        console.log(`Onboarding user ${user.id} already has a connection`)
        return NextResponse.redirect(new URL('/onboarding?step=klaviyo&error=limit_reached', request.url))
      }
    }

    // Insert new connection (not upsert - we allow multiple)
    const { data: newConnection, error: dbError } = await supabase
      .from('klaviyo_connections')
      .insert({
        user_id: user.id,
        klaviyo_account_id: klaviyoAccountId,
        account_name: accountName,
        store_url: storeUrlValidation.normalized,
        is_shared: isShared,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope,
      })
      .select('id')
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save Klaviyo connection')
    }

    // Reassign existing campaigns to the new connection
    // This preserves campaigns across reconnections
    if (klaviyoAccountId && newConnection) {
      await supabase
        .from('campaigns')
        .update({ klaviyo_connection_id: newConnection.id })
        .eq('user_id', user.id)
        .eq('klaviyo_account_id', klaviyoAccountId)
    }

    let redirectPath: string
    if (isOnboarding) {
      // Update onboarding step
      await supabase
        .from('profiles')
        .update({ onboarding_step: 5 })
        .eq('id', user.id)

      redirectPath = `/onboarding?step=klaviyo&success=klaviyo_connected&newConnectionId=${newConnection.id}`
    } else {
      redirectPath = `/connections?success=klaviyo_connected&newConnectionId=${newConnection.id}`
    }

    const response = NextResponse.redirect(new URL(redirectPath, request.url))
    response.cookies.delete('klaviyo_code_verifier')
    response.cookies.delete('klaviyo_oauth_state')
    response.cookies.delete('klaviyo_account_name')
    response.cookies.delete('klaviyo_store_url')
    response.cookies.delete('klaviyo_is_shared')

    return response
  } catch (err) {
    console.error('Klaviyo callback error:', err)
    return NextResponse.redirect(new URL('/connections?error=klaviyo_auth_failed', request.url))
  }
}
