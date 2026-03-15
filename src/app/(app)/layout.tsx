import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SidebarLayout } from '@/components/sidebar-layout'
import { TeamInvitationBanner } from '@/components/team-invitation-banner'
import { FooterMissingBanner } from '@/components/footer-missing-banner'
import { canAccessReports } from '@/lib/feature-access'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <SidebarLayout
      userEmail={user.email || ''}
      profile={profile}
      canAccessReports={canAccessReports(user.id)}
    >
      <TeamInvitationBanner userId={user.id} />
      <FooterMissingBanner userId={user.id} />
      {children}
    </SidebarLayout>
  )
}
