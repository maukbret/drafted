'use client'

import { useState } from 'react'
import { Copy, Check, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

interface EmailRow {
  id: string
  email: string
}

function newRow(): EmailRow {
  return { id: crypto.randomUUID(), email: '' }
}

interface TeamInviteCardProps {
  teamId: string
}

export function TeamInviteCard({ teamId }: TeamInviteCardProps) {
  const [rows, setRows] = useState<EmailRow[]>(() => [newRow(), newRow()])
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [sentResults, setSentResults] = useState<{ email: string; url: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateShareLink = async () => {
    setLinkLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/teams/${teamId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: null }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate invite link')
      }
      setShareUrl(data.inviteUrl)
      toast.success('Invite link ready to share')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate link'
      setError(message)
      toast.error(message)
    } finally {
      setLinkLoading(false)
    }
  }

  const copyShareLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      toast.success('Link copied')
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }

  const updateRow = (id: string, email: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, email } : r)))
    setSentResults(null)
  }

  const addRow = () => {
    setRows((prev) => [...prev, newRow()])
  }

  const sendInvites = async () => {
    const targets = [
      ...new Set(rows.map((r) => r.email.trim()).filter((e) => e.length > 0)),
    ]

    if (targets.length === 0) {
      toast.error('Add at least one email, or use the invite link below')
      return
    }

    setSendLoading(true)
    setError(null)
    setSentResults(null)

    const results: { email: string; url: string }[] = []

    try {
      for (const email of targets) {
        const response = await fetch(`/api/teams/${teamId}/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || `Failed for ${email}`)
        }
        results.push({ email, url: data.inviteUrl })
      }

      setSentResults(results)
      setRows([newRow(), newRow()])
      toast.success(
        results.length === 1
          ? 'Invitation created — copy the link below for that teammate'
          : `${results.length} invitations created — copy each link below`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invites'
      setError(message)
      toast.error(message)
    } finally {
      setSendLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm" id="team-invite">
      <CardHeader className="flex flex-col gap-1.5 pb-4">
        <CardTitle className="text-lg">Invite team</CardTitle>
        <CardDescription>Add members to your workspace</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Label className="text-foreground">Email</Label>
          {rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <Input
                type="email"
                placeholder="alex@example.com"
                value={row.email}
                onChange={(e) => updateRow(row.id, e.target.value)}
                disabled={sendLoading}
                className="min-w-0 flex-1"
              />
              <div className="flex h-9 w-full shrink-0 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground shadow-sm-sm sm:w-[140px]">
                Member
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={addRow}>
            <Plus data-icon="inline-start" />
            Add another
          </Button>
        </div>

        {sentResults && sentResults.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Personal invite links (each is unique)
            </p>
            <ul className="flex flex-col gap-3">
              {sentResults.map((r) => (
                <li key={r.email} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <span className="w-full max-w-[200px] truncate text-sm font-medium">{r.email}</span>
                  <div className="flex min-w-0 flex-1 gap-2">
                    <Input readOnly value={r.url} className="min-w-0 font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={async () => {
                        await navigator.clipboard.writeText(r.url)
                        toast.success('Copied')
                      }}
                    >
                      <Copy />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Separator />
          <p className="pt-2 text-sm font-medium">Or share invite link</p>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2">
            {shareUrl ? (
              <>
                <Input readOnly value={shareUrl} className="min-w-0 w-full flex-1 font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={copyShareLink}
                >
                  {linkCopied ? <Check className="text-green-600" /> : <Copy />}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="w-fit shrink-0"
                disabled={linkLoading}
                onClick={generateShareLink}
              >
                {linkLoading && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Generate invite link
              </Button>
            )}
          </div>
          {shareUrl && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Anyone with this link can join while it&apos;s valid (expires in 7 days).
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto shrink-0 p-0 text-xs"
                disabled={linkLoading}
                onClick={generateShareLink}
              >
                Create new link
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start border-t bg-muted/40 px-6 py-4">
        <Button type="button" className="w-fit" disabled={sendLoading} onClick={sendInvites}>
          {sendLoading && <Loader2 className="animate-spin" data-icon="inline-start" />}
          Send invites
        </Button>
      </CardFooter>
    </Card>
  )
}
