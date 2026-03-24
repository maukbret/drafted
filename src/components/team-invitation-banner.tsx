'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, Users, Loader2 } from 'lucide-react'

interface Invitation {
  id: string
  token: string
  teams: {
    id: string
    name: string
  }
  inviter_name: string | null
}

export function TeamInvitationBanner({ userId }: { userId: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [processingId, setProcessingId] = useState<string | null>(null)
  const router = useRouter()

  const fetchInvitations = useCallback(async () => {
    try {
      const response = await fetch('/api/invitations')
      if (response.ok) {
        const data = await response.json()
        setInvitations(data.invitations || [])
      }
    } catch (err) {
      console.error('Failed to fetch invitations:', err)
    }
  }, [])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  const handleAccept = async (invitation: Invitation) => {
    setProcessingId(invitation.id)

    try {
      const response = await fetch(`/api/invitations/${invitation.token}/accept`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to accept invitation')
      }

      setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))
      router.refresh()
      router.push('/team')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (invitation: Invitation) => {
    setProcessingId(invitation.id)

    try {
      const response = await fetch(`/api/invitations/${invitation.token}/decline`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to decline invitation')
      }

      setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to decline invitation')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id))
  }

  // Filter out dismissed invitations
  const visibleInvitations = invitations.filter(inv => !dismissedIds.has(inv.id))

  if (visibleInvitations.length === 0) return null

  return (
    <div className="space-y-3 mb-6">
      {visibleInvitations.map((invitation) => (
        <Card key={invitation.id} className="border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {invitation.inviter_name || 'Someone'} invited you to join{' '}
                    <span className="text-primary">{invitation.teams?.name || 'their team'}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Join to access shared Klaviyo connections and collaborate on campaigns
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDecline(invitation)}
                      disabled={processingId === invitation.id}
                    >
                      {processingId === invitation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Decline'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(invitation)}
                      disabled={processingId === invitation.id}
                    >
                      {processingId === invitation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Accept'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={() => handleDismiss(invitation.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
