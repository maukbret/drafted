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
import { Separator } from '@/components/ui/separator'
import { Users, Loader2 } from 'lucide-react'
import { TeamSettings } from '@/components/team/team-settings'
import type { TeamWithMembers } from '@/types/database'

interface TeamPageClientProps {
  team: TeamWithMembers | null
  role: 'admin' | 'member' | null
  currentUserId: string
}

export function TeamPageClient({ team, role, currentUserId }: TeamPageClientProps) {
  const [teamName, setTeamName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!teamName.trim()) {
      setError('Please enter a team name')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: teamName.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create team')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsCreating(false)
    }
  }

  // If user has a team, show team settings
  if (team && role) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-8 p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Your workspace, people, and invitations
          </p>
        </div>
        <TeamSettings team={team} role={role} currentUserId={currentUserId} />
      </div>
    )
  }

  // User is not in a team, show create team option
  return (
    <div className="flex w-full max-w-3xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Create or join a team to collaborate with others
        </p>
      </div>

      <div className="w-full max-w-md">
        <Card className="border-0 bg-transparent p-0 shadow-none">
          <CardHeader className="flex flex-col gap-4 p-0 pb-6">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Users className="text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1.5">
              <CardTitle>Create a team</CardTitle>
              <CardDescription className="text-balance">
                Invite others to collaborate. Members can use shared Klaviyo connections and see
                team campaigns.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <form onSubmit={handleCreateTeam} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="team-name">Team name</Label>
                <Input
                  id="team-name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Marketing Team"
                  disabled={isCreating}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={isCreating} className="w-full">
                {isCreating && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Create team
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 p-0 pt-6">
            <Separator />
            <p className="text-sm text-muted-foreground">
              Have an invite link? Open it while logged in to join.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
