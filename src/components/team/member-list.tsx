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
import { MoreVertical, Shield, UserMinus } from 'lucide-react'
import type { TeamMemberWithProfile } from '@/types/database'

interface MemberListProps {
  members: TeamMemberWithProfile[]
  teamId: string
  isAdmin: boolean
  currentUserId: string
}

function formatJoinedAt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
    return 'Team member'
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
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[40%]">Name</TableHead>
            <TableHead className="w-[20%]">Role</TableHead>
            <TableHead className="w-[28%] text-muted-foreground">Joined</TableHead>
            {isAdmin && <TableHead className="w-12 p-2 text-right" />}
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
                      className="size-9"
                      fallbackClassName="text-xs"
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium leading-none">
                        {getMemberDisplayName(member)}
                        {isCurrentUser && (
                          <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {member.role === 'admin' ? (
                    <Badge variant="secondary" className="font-normal">
                      Admin
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      Member
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  <time dateTime={member.joined_at}>{formatJoinedAt(member.joined_at)}</time>
                </TableCell>
                {isAdmin && (
                  <TableCell className="p-2 text-right">
                    {showActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreVertical data-icon="inline-start" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.role !== 'admin' && (
                            <>
                              <DropdownMenuItem onClick={() => setConfirmTransfer(member)}>
                                <Shield data-icon="inline-start" />
                                Make admin
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmRemove(member)}
                          >
                            <UserMinus data-icon="inline-start" />
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
            <AlertDialogAction onClick={handleTransferAdmin} disabled={!!transferringId}>
              {transferringId ? 'Transferring...' : 'Transfer admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
