'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Loader2, Trash2, LogOut, Pencil, X } from 'lucide-react'
import type { TeamWithMembers } from '@/types/database'
import { MemberList } from './member-list'
import { TeamInviteCard } from './team-invite-card'
import { TeamMembersEmpty } from './team-members-empty'

interface TeamSettingsProps {
  team: TeamWithMembers
  role: 'admin' | 'member'
  currentUserId: string
}

export function TeamSettings({ team, role, currentUserId }: TeamSettingsProps) {
  const isAdmin = role === 'admin'
  const members = team.team_members || []

  return (
    <div className="flex flex-col gap-10">
      <TeamOverviewSection team={team} isAdmin={isAdmin} />
      <TeamMembersSection
        members={members}
        teamId={team.id}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />
      <TeamDangerZone
        team={team}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        members={members}
      />
    </div>
  )
}

function TeamOverviewSection({
  team,
  isAdmin,
}: {
  team: TeamWithMembers
  isAdmin: boolean
}) {
  const [teamName, setTeamName] = useState(team.name)
  const [isEditingName, setIsEditingName] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleUpdateName = async () => {
    if (!teamName.trim() || teamName === team.name) {
      setIsEditingName(false)
      setTeamName(team.name)
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update team')
      }

      router.refresh()
      setIsEditingName(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update team')
    } finally {
      setIsSaving(false)
    }
  }

  const createdLabel = new Date(team.created_at).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/10 px-6 py-5">
      <div className="flex flex-col gap-1">
        {isEditingName ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              disabled={isSaving}
              className="max-w-md text-xl font-semibold tracking-tight"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateName()
                if (e.key === 'Escape') {
                  setIsEditingName(false)
                  setTeamName(team.name)
                }
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setIsEditingName(false)
                setTeamName(team.name)
              }}
              aria-label="Cancel edit"
            >
              <X data-icon="inline-start" />
            </Button>
            {teamName !== team.name && (
              <Button onClick={handleUpdateName} disabled={isSaving} size="sm">
                {isSaving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Save
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <h2 className="text-2xl font-semibold tracking-tight">{team.name}</h2>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditingName(true)}
                aria-label="Edit team name"
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Pencil data-icon="inline-start" />
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          <time dateTime={team.created_at}>Since {createdLabel}</time>
        </p>
      </div>
    </div>
  )
}

function TeamMembersSection({
  members,
  teamId,
  isAdmin,
  currentUserId,
}: {
  members: TeamWithMembers['team_members'] & {}
  teamId: string
  isAdmin: boolean
  currentUserId: string
}) {
  const inviteRef = useRef<HTMLDivElement>(null)
  const solo = members.length === 1
  const showEmptyState = isAdmin && solo
  const showMemberTable = !showEmptyState

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold leading-none tracking-tight">People</h2>
        <p className="text-sm text-muted-foreground">
          {members.length === 1
            ? 'One person in this team.'
            : `${members.length} people in this team.`}
        </p>
      </div>

      {showEmptyState && (
        <TeamMembersEmpty
          onInviteClick={() =>
            inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      )}

      {isAdmin && (
        <div ref={inviteRef}>
          <TeamInviteCard teamId={teamId} />
        </div>
      )}

      {showMemberTable && (
        <MemberList
          members={members ?? []}
          teamId={teamId}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}

function TeamDangerZone({
  team,
  isAdmin,
  currentUserId,
  members,
}: {
  team: TeamWithMembers
  isAdmin: boolean
  currentUserId: string
  members: TeamWithMembers['team_members'] & {}
}) {
  const [isLeaving, setIsLeaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const router = useRouter()

  const handleLeaveTeam = async () => {
    setIsLeaving(true)

    try {
      const currentMember = (members ?? []).find((m) => m.user_id === currentUserId)
      if (!currentMember) throw new Error('Membership not found')

      const response = await fetch(`/api/teams/${team.id}/members?memberId=${currentMember.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to leave team')
      }

      setShowLeaveConfirm(false)
      router.push('/team')
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to leave team')
    } finally {
      setIsLeaving(false)
    }
  }

  const handleDeleteTeam = async () => {
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete team')
      }

      setShowDeleteConfirm(false)
      router.push('/team')
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete team')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium text-muted-foreground">
            {isAdmin ? 'Delete team' : 'Leave team'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Permanently delete this team and remove all members. This cannot be undone.'
              : 'You will lose access to shared Klaviyo connections and team campaigns.'}
          </p>
        </div>
        {!isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            className="w-fit"
            onClick={() => setShowLeaveConfirm(true)}
          >
            <LogOut data-icon="inline-start" />
            Leave team
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            className="w-fit"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 data-icon="inline-start" />
            Delete team
          </Button>
        )}
      </div>

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave team?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave <span className="font-medium">{team.name}</span>? You
              will lose access to shared connections and campaigns.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveTeam}
              disabled={isLeaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLeaving ? 'Leaving...' : 'Leave team'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{' '}
              <span className="font-medium">{team.name}</span> and remove all team members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete team'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
