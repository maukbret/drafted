import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Check if user has a profile and if onboarding is completed
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', data.user.id)
        .single()

      // If no profile exists, create one with onboarding_completed = false
      if (profileError || !profile) {
        console.log('No profile found for user, creating one:', data.user.id)

        const { error: insertError } = await supabase.from('profiles').insert({
          id: data.user.id,
          onboarding_completed: false,
        })

        if (insertError) {
          console.error('Failed to create profile:', insertError)
          // Even if insert fails, redirect to onboarding - it will handle profile creation
        }

        // New user - always go to onboarding
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Redirect to onboarding if not completed, otherwise to requested page or campaigns
      const redirectPath = !profile.onboarding_completed
        ? '/onboarding'
        : (next ?? '/campaigns')

      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
