import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * After a user accepts a team invitation, mark onboarding complete so they skip
 * plan / Figma / Klaviyo; billing is already bypassed for team members in middleware.
 */
export async function markInvitedMemberOnboardingComplete(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<void> {
  const now = new Date().toISOString()

  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        onboarding_completed: true,
        onboarding_step: 5,
        updated_at: now,
      })
      .eq('id', userId)

    if (error) {
      console.error('markInvitedMemberOnboardingComplete update error:', error)
      throw error
    }
    return
  }

  const { error } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    full_name: null,
    avatar_url: null,
    onboarding_completed: true,
    onboarding_step: 5,
    subscription_selected: false,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    console.error('markInvitedMemberOnboardingComplete insert error:', error)
    throw error
  }
}
