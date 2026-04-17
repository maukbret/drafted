import { createClient } from '@/lib/supabase/server'
import { buildAuthCallbackRedirectUrl } from '@/lib/auth/auth-callback-url'
import {
  getAuthApiErrorCode,
  isInviteDuplicateAccountError,
} from '@/lib/auth/invite-email-errors'
import { createAppUrl, getAppUrl } from '@/lib/app-url'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// GET - Get team invitations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin of this team
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can view invitations' }, { status: 403 })
    }

    const { data: invitations, error } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('team_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch invitations error:', error)
      return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 })
    }

    return NextResponse.json({ invitations })

  } catch (err) {
    console.error('Get invitations error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const emailRaw = body?.email

    const rawInviteEmail =
      typeof emailRaw === 'string' && emailRaw.trim() ? emailRaw.trim() : null
    const storedEmail = rawInviteEmail ? rawInviteEmail.toLowerCase() : null

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin of this team
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can create invitations' }, { status: 403 })
    }

    // Generate a unique token
    const token = crypto.randomBytes(32).toString('hex')

    // Set expiration to 7 days from now
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invitation, error } = await supabase
      .from('team_invitations')
      .insert({
        team_id: id,
        email: storedEmail,
        token,
        invited_by: user.id,
        status: 'pending',
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Create invitation error:', error)
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
    }

    // Generate invite URL
    const inviteUrl = createAppUrl(`/invite/${token}`).toString()

    let authInviteSent = false
    let authInviteError: string | null = null
    let authInviteErrorCode: string | null = null

    /** Non-fatal hints (e.g. empty user in JSON) — invite may still have been queued. */
    let authInviteDiagnostic: string | null = null

    if (rawInviteEmail) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        authInviteError =
          'Server is missing SUPABASE_SERVICE_ROLE_KEY — cannot send Supabase invite emails.'
        console.error('inviteUserByEmail skipped: SUPABASE_SERVICE_ROLE_KEY not set')
      } else {
        const service = createServiceClient()
        const redirectTo = buildAuthCallbackRedirectUrl(getAppUrl(), `/invite/${token}`)

        const { data: inviteData, error: inviteErr } =
          await service.auth.admin.inviteUserByEmail(rawInviteEmail, {
            redirectTo,
            data: {
              team_invite_token: token,
              team_id: id,
            },
          })

        if (inviteErr) {
          authInviteErrorCode = getAuthApiErrorCode(inviteErr)
          if (isInviteDuplicateAccountError(inviteErr)) {
            authInviteError =
              'An account with this email already exists. They can sign in and use the invite link.'
          } else {
            console.error('inviteUserByEmail error:', inviteErr)
            const base =
              inviteErr.message || 'Could not send the invitation email. They can still use the link.'
            authInviteError =
              authInviteErrorCode && !base.toLowerCase().includes(authInviteErrorCode.toLowerCase())
                ? `${base} (${authInviteErrorCode})`
                : base
          }
        } else {
          // No error from GoTrue — invite email is queued. Some API versions omit `user` in JSON.
          authInviteSent = true
          if (!inviteData?.user?.id) {
            authInviteDiagnostic =
              'Supabase accepted the invite; if no email arrives, check Authentication → Users and SMTP.'
            console.warn('inviteUserByEmail: OK but no user in response body', inviteData)
          }
        }
      }
    }

    return NextResponse.json({
      invitation,
      inviteUrl,
      authInviteSent,
      authInviteError,
      authInviteErrorCode,
      authInviteDiagnostic,
    })

  } catch (err) {
    console.error('Create invitation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete an invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const invitationId = searchParams.get('invitationId')

    if (!invitationId) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin of this team
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can delete invitations' }, { status: 403 })
    }

    const { error } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitationId)
      .eq('team_id', id)

    if (error) {
      console.error('Delete invitation error:', error)
      return NextResponse.json({ error: 'Failed to delete invitation' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete invitation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
