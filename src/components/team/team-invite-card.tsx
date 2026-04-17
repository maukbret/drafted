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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

interface SentInviteRow {
  email: string
  inviteUrl: string
  authInviteSent: boolean
  authInviteError: string | null
  authInviteDiagnostic: string | null
}

export function TeamInviteCard({ teamId }: TeamInviteCardProps) {
  const [rows, setRows] = useState<EmailRow[]>(() => [newRow(), newRow()])
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [sentResults, setSentResults] = useState<SentInviteRow[] | null>(null)
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

    const results: SentInviteRow[] = []
    const failures: string[] = []

    try {
      for (const email of targets) {
        const response = await fetch(`/api/teams/${teamId}/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await response.json()
        if (!response.ok) {
          failures.push(`${email}: ${data.error || 'Request failed'}`)
          continue
        }
        results.push({
          email,
          inviteUrl: data.inviteUrl as string,
          authInviteSent: Boolean(data.authInviteSent),
          authInviteError:
            typeof data.authInviteError === 'string' ? data.authInviteError : null,
          authInviteDiagnostic:
            typeof data.authInviteDiagnostic === 'string' ? data.authInviteDiagnostic : null,
        })
      }

      if (results.length === 0) {
        const message =
          failures.length > 0 ? failures.join(' ') : 'Could not create invitations'
        setError(message)
        toast.error(message)
        return
      }

      setSentResults(results)
      setRows([newRow(), newRow()])

      if (failures.length > 0) {
        toast.message('Some invitations failed', {
          description: failures.slice(0, 3).join(' · '),
        })
      }

      const emailed = results.filter((r) => r.authInviteSent).length
      if (emailed === results.length) {
        toast.success(
          results.length === 1
            ? 'Invitation email sent — they can also use the link below if needed'
            : `Invitation emails sent (${results.length}) — links below as backup`,
        )
      } else {
        const detailLines = results
          .filter((r) => !r.authInviteSent)
          .flatMap((r) => {
            const parts = [r.authInviteError, r.authInviteDiagnostic].filter(
              (s): s is string => typeof s === 'string' && s.length > 0,
            )
            return parts.length ? [parts.join(' — ')] : []
          })
        toast.message(
          `${results.length} invite(s) created. ${emailed} email(s) sent via Supabase; share links for the rest.`,
          {
            description:
              detailLines.length > 0
                ? detailLines.slice(0, 2).join(' · ')
                : 'If you expected an email, check Supabase Auth logs and SMTP.',
          },
        )
      }
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
        <CardDescription>
          We email a Supabase invite to each address (set password / sign in), plus a personal link
          as backup. Share-only links work for anyone while valid.
        </CardDescription>
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
              Invites — email status and personal link
            </p>
            <ul className="flex flex-col gap-3">
              {sentResults.map((r) => (
                <li key={r.email} className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="truncate text-sm font-medium">{r.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.authInviteSent
                        ? 'Invite email sent'
                        : r.authInviteError
                          ? 'Email not sent — share link'
                          : 'Share link only'}
                    </span>
                  </div>
                  {r.authInviteError ? (
                    <p className="text-xs text-muted-foreground">{r.authInviteError}</p>
                  ) : null}
                  {r.authInviteDiagnostic ? (
                    <p className="text-xs font-medium text-foreground">{r.authInviteDiagnostic}</p>
                  ) : null}
                  <div className="flex min-w-0 flex-1 gap-2">
                    <Input readOnly value={r.inviteUrl} className="min-w-0 font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={async () => {
                        await navigator.clipboard.writeText(r.inviteUrl)
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

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
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
