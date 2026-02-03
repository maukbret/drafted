'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Loader2 } from 'lucide-react'

interface InviteAcceptClientProps {
  token: string
  teamName: string
  inviterName: string
}

export function InviteAcceptClient({ token, teamName, inviterName }: InviteAcceptClientProps) {
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

      router.push('/team')
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="max-w-md w-full mx-4">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Team Invitation</CardTitle>
            <CardDescription>
              {inviterName} has invited you to join their team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-2xl font-semibold">{teamName}</p>
              <p className="text-sm text-muted-foreground mt-2">
                By joining this team, you&apos;ll be able to access shared Klaviyo connections, view team campaigns, and collaborate with other members.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDecline}
                disabled={isLoading}
              >
                {isDeclining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Decline
              </Button>
              <Button
                className="flex-1"
                onClick={handleAccept}
                disabled={isLoading}
              >
                {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join Team
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
