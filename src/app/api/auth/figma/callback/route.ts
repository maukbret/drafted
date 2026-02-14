import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  // Get cookies
  const cookieStore = await cookies()
  const storedState = cookieStore.get('figma_oauth_state')?.value

  // Helper to determine redirect base based on onboarding status
  const getRedirectBase = async (supabase: Awaited<ReturnType<typeof createClient>>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { isOnboarding: false }

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    return { isOnboarding: !profile?.onboarding_completed }
  }

  // Handle OAuth errors
  if (error) {
    console.error('Figma OAuth error:', error)
    const supabase = await createClient()
    const { isOnboarding } = await getRedirectBase(supabase)
    const redirectPath = isOnboarding
      ? '/onboarding?step=figma&error=figma_auth_failed'
      : '/connections?error=figma_auth_failed'
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  if (!code) {
    const supabase = await createClient()
    const { isOnboarding } = await getRedirectBase(supabase)
    const redirectPath = isOnboarding
      ? '/onboarding?step=figma&error=no_code'
      : '/connections?error=no_code'
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  // Verify state to prevent CSRF
  if (!state || state !== storedState) {
    console.error('State mismatch:', { state, storedState })
    const supabase = await createClient()
    const { isOnboarding } = await getRedirectBase(supabase)
    const redirectPath = isOnboarding
      ? '/onboarding?step=figma&error=state_mismatch'
      : '/connections?error=state_mismatch'
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://api.figma.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.FIGMA_CLIENT_ID!,
        client_secret: process.env.FIGMA_CLIENT_SECRET!,
        redirect_uri: process.env.NEXT_PUBLIC_FIGMA_REDIRECT_URI!,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Figma token exchange failed:', errorData)
      throw new Error('Failed to exchange code for token')
    }

    const tokens = await tokenResponse.json()

    // Get current user
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Get Figma user info to store with the connection
    const userResponse = await fetch('https://api.figma.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    })

    let figmaUserId = null
    let figmaEmail = null
    if (userResponse.ok) {
      const figmaUser = await userResponse.json()
      figmaUserId = figmaUser.id
      figmaEmail = figmaUser.email
    }

    // Store the connection in the database
    const { error: dbError } = await supabase
      .from('figma_connections')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        figma_user_id: figmaUserId,
        figma_email: figmaEmail,
      }, {
        onConflict: 'user_id',
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save Figma connection')
    }

    // Check onboarding status for redirect
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    let redirectPath: string
    if (!profile?.onboarding_completed) {
      // Update onboarding step
      await supabase
        .from('profiles')
        .update({ onboarding_step: 4 })
        .eq('id', user.id)

      redirectPath = '/onboarding?step=klaviyo&success=figma_connected'
    } else {
      redirectPath = '/connections?success=figma_connected'
    }

    // Clear the state cookie
    const response = NextResponse.redirect(new URL(redirectPath, request.url))
    response.cookies.delete('figma_oauth_state')

    return response
  } catch (err) {
    console.error('Figma callback error:', err)
    // Try to determine onboarding status for error redirect
    try {
      const supabase = await createClient()
      const { isOnboarding } = await getRedirectBase(supabase)
      const redirectPath = isOnboarding
        ? '/onboarding?step=figma&error=figma_auth_failed'
        : '/connections?error=figma_auth_failed'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    } catch {
      return NextResponse.redirect(new URL('/connections?error=figma_auth_failed', request.url))
    }
  }
}
