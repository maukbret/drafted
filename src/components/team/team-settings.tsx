'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import { Loader2, Trash2, LogOut, Pencil, X } from 'lucide-react'
import type { TeamWithMembers } from '@/types/database'
import { MemberList } from './member-list'
import { InviteForm } from './invite-form'

interface TeamSettingsProps {
  team: TeamWithMembers
  role: 'admin' | 'member'
  currentUserId: string
}

export function TeamSettings({ team, role, currentUserId }: TeamSettingsProps) {
  const [teamName, setTeamName] = useState(team.name)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const router = useRouter()

  const isAdmin = role === 'admin'
  const members = team.team_members || []

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

  const handleLeaveTeam = async () => {
    setIsLeaving(true)

    try {
      const currentMember = members.find(m => m.user_id === currentUserId)
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
      {/* Team Details */}
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Team Details</CardTitle>
            <span className="text-xs text-muted-foreground">
              Created {new Date(team.created_at).toLocaleDateString('en-GB')}
            </span>
          </div>
          <CardDescription>
            {isAdmin
              ? 'Manage your team settings'
              : 'View your team information'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="team-name">Team name</Label>
            <div className="flex items-center gap-2">
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                disabled={!isAdmin || isSaving || !isEditingName}
                className="max-w-sm"
              />
              {isAdmin && !isEditingName && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditingName(true)}
                  aria-label="Edit team name"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {isAdmin && isEditingName && (
                <Button
                  type="button"
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
              )}
              {isAdmin && isEditingName && teamName !== team.name && (
                <Button onClick={handleUpdateName} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              )}
            </div>
          </div>
        </CardContent>
        
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? 'member' : 'members'} in your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            teamId={team.id}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
          />
        </CardContent>
      </Card>

      {/* Invite Section (Admin only) */}
      {isAdmin && <InviteForm teamId={team.id} />}

      {/* Danger Zone */}
      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for your team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAdmin && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
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
            <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
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
        </CardContent>
      </Card>

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
