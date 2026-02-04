'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UserMinus, Loader2 } from 'lucide-react'
import type { TeamMemberWithProfile } from '@/types/database'

interface MemberListProps {
  members: TeamMemberWithProfile[]
  teamId: string
  isAdmin: boolean
  currentUserId: string
}

export function MemberList({ members, teamId, isAdmin, currentUserId }: MemberListProps) {
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<TeamMemberWithProfile | null>(null)
  const router = useRouter()

  const handleRemove = async () => {
    if (!confirmRemove) return

    setRemovingId(confirmRemove.id)

    try {
      const response = await fetch(`/api/teams/${teamId}/members?memberId=${confirmRemove.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove member')
      }

      setConfirmRemove(null)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  const getMemberDisplayName = (member: TeamMemberWithProfile) => {
    if (member.profiles?.full_name) return member.profiles.full_name
    if (member.email) return member.email
    return 'Team Member'
  }

  return (
    <div className="divide-y">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
        >
          <div className="flex items-center gap-3">
            <UserAvatar
              name={getMemberDisplayName(member)}
              imageUrl={member.profiles?.avatar_url}
              className="h-9 w-9"
              fallbackClassName="text-xs"
            />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium leading-none">
                  {getMemberDisplayName(member)}
                </span>
                {member.user_id === currentUserId && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
                {member.role === 'admin' && (
                  <Badge variant="secondary" className="h-5 text-xs">
                    Admin
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Joined {new Date(member.joined_at).toLocaleDateString('en-GB')}
              </p>
            </div>
          </div>

          {isAdmin && member.user_id !== currentUserId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmRemove(member)}
                    disabled={removingId === member.id}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    {removingId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove member</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ))}

      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-medium text-foreground">
                {confirmRemove ? getMemberDisplayName(confirmRemove) : ''}
              </span>{' '}
              from the team? They will lose access to shared connections and campaigns.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!removingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={!!removingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingId ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
