'use client'

import { useState } from 'react'
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
import { Copy, Check, UserPlus, Loader2 } from 'lucide-react'

interface InviteFormProps {
  teamId: string
}

export function InviteForm({ teamId }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateInviteLink = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch(`/api/teams/${teamId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || null }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate invite link')
      }

      setInviteUrl(data.inviteUrl)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = async () => {
    if (!inviteUrl) return

    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const resetForm = () => {
    setInviteUrl(null)
    setEmail('')
    setError(null)
  }

  if (inviteUrl) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-base">Invite link created</CardTitle>
              <CardDescription>Share this link with your teammate</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="invite-url">Invite link</Label>
            <div className="flex gap-2">
              <Input
                id="invite-url"
                value={inviteUrl}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="icon"
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link will expire in 7 days
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button variant="outline" onClick={resetForm} className="w-full">
            Create another invite
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Invite Team Member</CardTitle>
            <CardDescription>Generate a link to invite someone to your team</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email address (optional)</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            disabled={isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            If provided, they&apos;ll see a notification when they log in
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-6">
        <Button
          onClick={generateInviteLink}
          disabled={isGenerating}
          className="w-full"
        >
          {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate invite link
        </Button>
      </CardFooter>
    </Card>
  )
}
