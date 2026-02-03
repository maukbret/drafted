import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InviteAcceptClient } from './invite-accept-client'

interface InvitePageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get invitation details
  const { data: invitation } = await supabase
    .from('team_invitations')
    .select('*, teams(id, name)')
    .eq('token', token)
    .single()

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-4">
          <div className="bg-background rounded-lg border p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Invalid Invitation</h1>
            <p className="text-muted-foreground">
              This invitation link is invalid or has been revoked.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Check if invitation is expired
  const isExpired = new Date(invitation.expires_at) < new Date()
  if (isExpired || invitation.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-4">
          <div className="bg-background rounded-lg border p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Invitation Expired</h1>
            <p className="text-muted-foreground">
              This invitation has expired. Please ask the team admin for a new invitation.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Check if invitation was already used
  if (invitation.status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-4">
          <div className="bg-background rounded-lg border p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Invitation Already Used</h1>
            <p className="text-muted-foreground">
              This invitation has already been accepted.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (invitation.status === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-4">
          <div className="bg-background rounded-lg border p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Invitation Declined</h1>
            <p className="text-muted-foreground">
              This invitation was previously declined. Please ask the team admin for a new invitation if you&apos;d like to join.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // If not logged in, redirect to login with return URL
  if (!user) {
    redirect(`/login?redirect=/invite/${token}`)
  }

  // Check if user is already in a team
  const { data: existingMembership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single()

  if (existingMembership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="max-w-md w-full mx-4">
          <div className="bg-background rounded-lg border p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Already in a Team</h1>
            <p className="text-muted-foreground mb-4">
              You are already a member of a team. You must leave your current team before joining another.
            </p>
            <a href="/team" className="text-primary hover:underline">
              Go to Team Settings
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Get inviter's name
  let inviterName = 'Someone'
  if (invitation.invited_by) {
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', invitation.invited_by)
      .single()

    if (inviterProfile?.full_name) {
      inviterName = inviterProfile.full_name
    }
  }

  return (
    <InviteAcceptClient
      token={token}
      teamName={invitation.teams?.name || 'Unknown Team'}
      inviterName={inviterName}
    />
  )
}
