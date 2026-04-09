'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InviteOptionalProfileStep } from '@/components/invite/invite-optional-profile-step'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Loader2 } from 'lucide-react'

interface InviteAcceptClientProps {
  token: string
  teamName: string
  inviterName: string
}

export function InviteAcceptClient({ token, teamName, inviterName }: InviteAcceptClientProps) {
  const [phase, setPhase] = useState<'invite' | 'profile'>('invite')
  const [acceptedTeamName, setAcceptedTeamName] = useState(teamName)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleAccept = async () => {
    setIsAccepting(true)
    setError(null)

    try {
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation')
      }

      const joinedName =
        data.team && typeof data.team === 'object' && 'name' in data.team
          ? String((data.team as { name?: string }).name ?? '')
          : ''
      setAcceptedTeamName(joinedName || teamName)
      setPhase('profile')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleDecline = async () => {
    setIsDeclining(true)
    setError(null)

    try {
      const response = await fetch(`/api/invitations/${token}/decline`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to decline invitation')
      }

      router.push('/campaigns')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsDeclining(false)
    }
  }

  const isLoading = isAccepting || isDeclining

  if (phase === 'profile') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="mx-4 w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              <InviteOptionalProfileStep
                teamName={acceptedTeamName}
                onDone={() => {
                  router.refresh()
                  router.push('/campaigns')
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="mx-4 w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Team Invitation</CardTitle>
            <CardDescription>
              {inviterName} has invited you to join their team
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="text-center">
              <p className="text-2xl font-semibold">{teamName}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                By joining this team, you&apos;ll be able to access shared Klaviyo connections, view
                team campaigns, and collaborate with other members.
              </p>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => void handleDecline()}
                disabled={isLoading}
              >
                {isDeclining ? (
                  <>
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                    Decline
                  </>
                ) : (
                  'Decline'
                )}
              </Button>
              <Button className="flex-1" onClick={() => void handleAccept()} disabled={isLoading}>
                {isAccepting ? (
                  <>
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                    Join Team
                  </>
                ) : (
                  'Join Team'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
