'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Campaign } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2, Mail, ExternalLink } from 'lucide-react'

interface CampaignWithConnection extends Campaign {
  klaviyo_connections?: {
    account_name: string | null
  } | null
}

interface CampaignListProps {
  campaigns: CampaignWithConnection[]
}

const STATUS_CONFIG: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string; label: string }> = {
  in_progress: {
    variant: 'secondary',
    className: '',
    label: 'In progress',
  },
  klaviyo_draft: {
    variant: 'default',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100',
    label: 'Klaviyo draft',
  },
  scheduled: {
    variant: 'default',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100',
    label: 'Scheduled',
  },
  sent: {
    variant: 'default',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100',
    label: 'Sent',
  },
  error: {
    variant: 'destructive',
    className: '',
    label: 'Error',
  },
  // Legacy status aliases
  draft: {
    variant: 'secondary',
    className: '',
    label: 'In progress',
  },
  ready: {
    variant: 'default',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100',
    label: 'Klaviyo draft',
  },
}

export function CampaignList({ campaigns }: CampaignListProps) {
  const [deleteModalCampaign, setDeleteModalCampaign] = useState<CampaignWithConnection | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!deleteModalCampaign) return

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/campaigns/${deleteModalCampaign.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      setDeleteModalCampaign(null)
      router.refresh()
    } catch (err) {
      alert('Failed to delete campaign')
    } finally {
      setIsDeleting(false)
    }
  }

  if (campaigns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 mb-4 bg-muted rounded-full flex items-center justify-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first campaign to get started
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="p-0 divide-y">
          {campaigns.map((campaign) => {
            const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.in_progress

            return (
              <div
                key={campaign.id}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="font-medium hover:underline truncate"
                    >
                      {campaign.name}
                    </Link>
                    <Badge variant={status.variant} className={status.className}>
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {campaign.klaviyo_connections?.account_name && (
                      <span>{campaign.klaviyo_connections.account_name}</span>
                    )}
                    {campaign.subject_line && (
                      <span className="truncate max-w-[200px]">{campaign.subject_line}</span>
                    )}
                    <span>{new Date(campaign.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {(campaign.status === 'in_progress' || (campaign.status as string) === 'draft') && (
                    <Button asChild>
                      <Link href={`/campaigns/${campaign.id}`}>
                        Continue
                      </Link>
                    </Button>
                  )}
                  {(campaign.status === 'klaviyo_draft' || (campaign.status as string) === 'ready') && campaign.klaviyo_campaign_id && (
                    <Button variant="secondary" asChild>
                      <a
                        href={`https://www.klaviyo.com/campaign/${campaign.klaviyo_campaign_id}/scheduled`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-1.5" />
                        View in Klaviyo
                      </a>
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/campaigns/${campaign.id}`}>
                          <Pencil className="h-4 w-4 mr-1.5" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteModalCampaign(campaign)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Delete confirmation modal */}
      <Dialog open={!!deleteModalCampaign} onOpenChange={(open) => !open && !isDeleting && setDeleteModalCampaign(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <DialogTitle>Delete campaign</DialogTitle>
                <DialogDescription>
                  This action cannot be undone
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">&quot;{deleteModalCampaign?.name}&quot;</span>? This will permanently remove the campaign from your Drafted account.
          </p>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setDeleteModalCampaign(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
