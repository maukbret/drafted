import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Define page types
  const isAuthPage = request.nextUrl.pathname === '/login' ||
                     request.nextUrl.pathname === '/signup'

  const isPublicPage = isAuthPage ||
                       request.nextUrl.pathname === '/onboarding' ||
                       request.nextUrl.pathname.startsWith('/onboarding/preview') ||
                       request.nextUrl.pathname.startsWith('/api/auth') ||
                       request.nextUrl.pathname.startsWith('/invite')

  const isOnboardingPage = request.nextUrl.pathname === '/onboarding'
  const isBillingPage = request.nextUrl.pathname === '/billing'
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')
  const isWebhookRoute = request.nextUrl.pathname.startsWith('/api/webhooks/')
  // Allow webhook routes without auth check
  if (isWebhookRoute) {
    return supabaseResponse
  }

  // Redirect unauthenticated users to login (except for public pages)
  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // For authenticated users, check onboarding and subscription status
  if (user && !isOnboardingPage && !isBillingPage && !isApiRoute && !isPublicPage) {
    // Check user profile status
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed, subscription_selected')
      .eq('id', user.id)
      .single()

    // Redirect to onboarding if profile not completed
    if (!profile || !profile.onboarding_completed) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    // If no plan selected yet, allow team members; otherwise keep on billing
    if (!profile.subscription_selected) {
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!teamMembership) {
        const url = request.nextUrl.clone()
        url.pathname = '/billing'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Check for active subscription only if a plan was selected
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single()

    const hasActiveSubscription = subscription?.status === 'trialing' ||
                                   subscription?.status === 'active'

    // If no active subscription, redirect to billing page
    if (!hasActiveSubscription) {
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!teamMembership) {
        const url = request.nextUrl.clone()
        url.pathname = '/billing'
        return NextResponse.redirect(url)
      }
    }
  }

  // Redirect authenticated users away from login/signup
  if (user && isAuthPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed, subscription_selected')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()

    if (!profile || !profile.onboarding_completed) {
      url.pathname = '/onboarding'
    } else if (!profile.subscription_selected) {
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      url.pathname = teamMembership ? '/campaigns' : '/billing'
    } else {
      url.pathname = '/campaigns'
    }

    return NextResponse.redirect(url)
  }

  // If user is on onboarding page but already completed everything, redirect to campaigns
  if (user && isOnboardingPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed, subscription_selected')
      .eq('id', user.id)
      .single()

    if (profile?.onboarding_completed && !profile?.subscription_selected) {
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      const url = request.nextUrl.clone()
      url.pathname = teamMembership ? '/campaigns' : '/billing'
      return NextResponse.redirect(url)
    }

    if (profile?.onboarding_completed && profile?.subscription_selected) {
      // Check if they have active subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .single()

      const hasActiveSubscription = subscription?.status === 'trialing' ||
                                     subscription?.status === 'active'

      const url = request.nextUrl.clone()
      if (hasActiveSubscription) {
        url.pathname = '/campaigns'
      } else {
        const { data: teamMembership } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        url.pathname = teamMembership ? '/campaigns' : '/billing'
      }
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
