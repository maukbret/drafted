import { createClient } from '@/lib/supabase/server'
import {
  invitePathFromUserMetadata,
  sanitizeAuthNextParam,
} from '@/lib/auth/auth-callback-url'
import { profileSeedFromOAuthUser } from '@/lib/auth/profile-seed'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const seeds = profileSeedFromOAuthUser(data.user)

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('onboarding_completed, full_name, avatar_url')
        .eq('id', data.user.id)
        .single()

      const safeNext = sanitizeAuthNextParam(next)
      const inviteFromQuery =
        safeNext && safeNext.startsWith('/invite/') ? safeNext : null
      const inviteFromMetadata = invitePathFromUserMetadata(data.user)
      const inviteDest = inviteFromQuery ?? inviteFromMetadata

      // If no profile exists, create one with onboarding_completed = false
      if (profileError || !profile) {
        console.log('No profile found for user, creating one:', data.user.id)

        const { error: insertError } = await supabase.from('profiles').insert({
          id: data.user.id,
          onboarding_completed: false,
          onboarding_step: 1,
          ...(seeds.full_name ? { full_name: seeds.full_name } : {}),
          ...(seeds.avatar_url ? { avatar_url: seeds.avatar_url } : {}),
        })

        if (insertError) {
          console.error('Failed to create profile:', insertError)
          // Even if insert fails, redirect to onboarding - it will handle profile creation
        }

        // Invited users: `/invite/…` from `next` or from inviteUserByEmail user_metadata
        return NextResponse.redirect(`${origin}${inviteDest ?? '/onboarding'}`)
      }

      const patch: {
        full_name?: string
        avatar_url?: string
        updated_at: string
      } = { updated_at: new Date().toISOString() }
      if (!profile.full_name && seeds.full_name) {
        patch.full_name = seeds.full_name
      }
      if (!profile.avatar_url && seeds.avatar_url) {
        patch.avatar_url = seeds.avatar_url
      }
      if (patch.full_name !== undefined || patch.avatar_url !== undefined) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(patch)
          .eq('id', data.user.id)
        if (updateError) {
          console.error('Failed to enrich profile from OAuth:', updateError)
        }
      }

      // Incomplete onboarding: honor invite deep-link (query or metadata); otherwise full wizard
      const redirectPath = !profile.onboarding_completed
        ? inviteDest ?? '/onboarding'
        : (safeNext ?? '/campaigns')

      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
