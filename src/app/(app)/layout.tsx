import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SidebarLayout } from '@/components/sidebar-layout'

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
    <SidebarLayout userEmail={user.email || ''} profile={profile}>
      {children}
    </SidebarLayout>
  )
}
