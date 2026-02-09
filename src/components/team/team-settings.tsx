'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Loader2, Trash2, LogOut, Pencil, X, UserPlus } from 'lucide-react'
import type { TeamWithMembers } from '@/types/database'
import { MemberList } from './member-list'
import { InviteForm } from './invite-form'

interface TeamSettingsProps {
  team: TeamWithMembers
  role: 'admin' | 'member'
  currentUserId: string
}

export function TeamSettings({ team, role, currentUserId }: TeamSettingsProps) {
  const isAdmin = role === 'admin'
  const members = team.team_members || []

  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-6">
        <GeneralTab team={team} isAdmin={isAdmin} memberCount={members.length} />
      </TabsContent>

      <TabsContent value="members" className="mt-6">
        <MembersTab
          members={members}
          teamId={team.id}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      </TabsContent>

      <TabsContent value="advanced" className="mt-6">
        <AdvancedTab
          team={team}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          members={members}
        />
      </TabsContent>
    </Tabs>
  )
}

// --- General Tab ---

function GeneralTab({
  team,
  isAdmin,
  memberCount,
}: {
  team: TeamWithMembers
  isAdmin: boolean
  memberCount: number
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

  return (
    <div className="space-y-6">
      {/* Team name */}
      <div>
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              disabled={isSaving}
              className="max-w-sm text-xl font-semibold h-auto py-1"
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
              <X className="h-4 w-4" />
            </Button>
            {teamName !== team.name && (
              <Button onClick={handleUpdateName} disabled={isSaving} size="sm">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{team.name}</h2>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditingName(true)}
                aria-label="Edit team name"
                className="h-8 w-8"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="flex gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Members</p>
          <p className="text-sm font-medium">{memberCount}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Created</p>
          <p className="text-sm font-medium">
            {new Date(team.created_at).toLocaleDateString('en-GB')}
          </p>
        </div>
      </div>
    </div>
  )
}

// --- Members Tab ---

function MembersTab({
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
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <div className="space-y-6">
      <MemberList
        members={members ?? []}
        teamId={teamId}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />

      {isAdmin && (
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="default">
              <UserPlus className="h-4 w-4" />
              Invite member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription>
                Generate a link to invite someone to your team
              </DialogDescription>
            </DialogHeader>
            <InviteForm teamId={teamId} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// --- Advanced Tab ---

function AdvancedTab({
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
      const currentMember = (members ?? []).find(m => m.user_id === currentUserId)
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
    <div className="space-y-6">
      {!isAdmin && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Leave team</p>
            <p className="text-sm text-muted-foreground">
              You will lose access to shared connections and campaigns
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowLeaveConfirm(true)}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Leave
          </Button>
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Delete team</p>
            <p className="text-sm text-muted-foreground">
              This will remove all members and cannot be undone
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      )}

      {/* Leave Confirmation */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave team?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave <span className="font-medium">{team.name}</span>? You will lose access to shared connections and campaigns.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveTeam}
              disabled={isLeaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLeaving ? 'Leaving...' : 'Leave Team'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete <span className="font-medium">{team.name}</span> and remove all team members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Team'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
