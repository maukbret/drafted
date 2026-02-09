'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { MoreVertical, Shield, UserMinus, Loader2 } from 'lucide-react'
import type { TeamMemberWithProfile } from '@/types/database'

interface MemberListProps {
  members: TeamMemberWithProfile[]
  teamId: string
  isAdmin: boolean
  currentUserId: string
}

export function MemberList({ members, teamId, isAdmin, currentUserId }: MemberListProps) {
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<TeamMemberWithProfile | null>(null)
  const [confirmTransfer, setConfirmTransfer] = useState<TeamMemberWithProfile | null>(null)
  const router = useRouter()

  const getMemberDisplayName = (member: TeamMemberWithProfile) => {
    if (member.profiles?.full_name) return member.profiles.full_name
    if (member.email) return member.email
    return 'Team Member'
  }

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

  const handleTransferAdmin = async () => {
    if (!confirmTransfer) return

    setTransferringId(confirmTransfer.id)

    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: confirmTransfer.id, role: 'admin' }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to transfer admin role')
      }

      setConfirmTransfer(null)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to transfer admin role')
    } finally {
      setTransferringId(null)
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Joined</TableHead>
            {isAdmin && <TableHead className="w-[50px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isCurrentUser = member.user_id === currentUserId
            const showActions = isAdmin && !isCurrentUser

            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={getMemberDisplayName(member)}
                      imageUrl={member.profiles?.avatar_url}
                      className="h-8 w-8"
                      fallbackClassName="text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {getMemberDisplayName(member)}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                      {member.role === 'admin' && (
                        <Badge variant="secondary" className="h-5 text-xs">
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(member.joined_at).toLocaleDateString('en-GB')}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    {showActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setConfirmTransfer(member)}>
                            <Shield className="mr-1.5 h-4 w-4" />
                            Make admin
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmRemove(member)}
                          >
                            <UserMinus className="mr-1.5 h-4 w-4" />
                            Remove from team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Transfer admin confirmation */}
      <AlertDialog open={!!confirmTransfer} onOpenChange={(open) => !open && setConfirmTransfer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer admin role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will transfer your admin role to{' '}
              <span className="font-medium text-foreground">
                {confirmTransfer ? getMemberDisplayName(confirmTransfer) : ''}
              </span>
              . You will become a regular member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!transferringId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransferAdmin}
              disabled={!!transferringId}
            >
              {transferringId ? 'Transferring...' : 'Transfer admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove member confirmation */}
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
    </>
  )
}
