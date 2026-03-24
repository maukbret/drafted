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
      <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm">
          Manage your team and invite members
        </p>
      </div>

        <TeamSettings team={team} role={role} currentUserId={currentUserId} />
      </div>
    )
  }

  // User is not in a team, show create team option
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm">
          Create or join a team to collaborate with others
        </p>
      </div>

      <div className="max-w-md">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Users className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Create a Team</CardTitle>
            <CardDescription className="text-balance">
              Start a team and invite others to collaborate. Team members can access shared Klaviyo connections and see each other&apos;s campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTeam} className="space-y-6">
              <div className="grid gap-2">
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
                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Team
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col border-t pt-6">
            <Separator className="mb-4" />
            <p className="text-center text-sm text-muted-foreground">
              Have an invite link? Just open the link while logged in to join a team.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
