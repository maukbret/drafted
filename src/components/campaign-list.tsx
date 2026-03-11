'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { Campaign } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/user-avatar'
import { BrandIcon } from '@/components/brand-icon'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EditScheduledCampaignDialog } from '@/components/edit-scheduled-campaign-dialog'
import { MoreVertical, Pencil, Trash2, Mail, ExternalLink, Search, EyeOff, Eye, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface CampaignWithConnection extends Campaign {
  klaviyo_connections?: {
    account_name: string | null
    store_url?: string | null
  } | null
  profiles?: { full_name: string | null } | null
  is_own?: boolean
  creator_name?: string | null
  creator_avatar_url?: string | null
}

interface CampaignListProps {
  campaigns: CampaignWithConnection[]
  currentUserId?: string
  isTeamAdmin?: boolean
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
type StatusFilter = 'active' | 'scheduled' | 'sent' | 'all'
type SortOption =
  | 'created_desc'
  | 'created_asc'
  | 'updated_desc'
  | 'updated_asc'
  | 'name_asc'
  | 'name_desc'

const COLUMN_WIDTH_CLASSES: Record<string, string> = {
  account: 'w-[160px] sm:w-[180px] lg:w-[200px]',
  name: 'w-[200px] sm:w-[240px] lg:w-[300px]',
  created_by: 'w-[64px] sm:w-[120px] lg:w-[170px]',
  updated_at: 'w-[110px] sm:w-[120px] lg:w-[130px]',
  status: 'w-[100px] sm:w-[110px] lg:w-[120px]',
  actions: 'w-[56px] sm:w-[64px]',
}

const STATUS_CONFIG = {
  in_progress: {
    variant: 'secondary',
    className: '',
    dotClassName: 'bg-zinc-500 dark:bg-zinc-400',
    label: 'Concept',
  },
  klaviyo_draft: {
    variant: 'default',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100',
    dotClassName: 'bg-blue-700 dark:bg-blue-300',
    label: 'Saved to Klaviyo',
  },
  scheduled: {
    variant: 'default',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100',
    dotClassName: 'bg-yellow-700 dark:bg-yellow-300',
    label: 'Scheduled',
  },
  cancelled: {
    variant: 'default',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100',
    dotClassName: 'bg-red-700 dark:bg-red-300',
    label: 'Cancelled',
  },
  sent: {
    variant: 'default',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100',
    dotClassName: 'bg-green-700 dark:bg-green-300',
    label: 'Sent',
  },
  error: {
    variant: 'destructive',
    className: '',
    dotClassName: 'bg-red-900 dark:bg-red-300',
    label: 'Error',
  },

  // Legacy status aliases
  draft: {
    variant: 'secondary',
    className: '',
    dotClassName: 'bg-zinc-500 dark:bg-zinc-400',
    label: 'Concept',
  },
  ready: {
    variant: 'default',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100',
    dotClassName: 'bg-blue-700 dark:bg-blue-300',
    label: 'Saved to Klaviyo',
  },
} as const satisfies Record<
  string,
  { variant: BadgeVariant; className: string; dotClassName: string; label: string }
>

function toTimestamp(value: unknown) {
  const date = new Date(String(value ?? ''))
  const timestamp = date.getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function formatAbsoluteDateTime(value: unknown) {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeUpdated(value: unknown) {
  const timestamp = toTimestamp(value)
  if (!timestamp) return '—'

  const diffMs = Date.now() - timestamp
  if (diffMs < 0) return 'Just now'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} min ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function getCreatorDisplayName(campaign: CampaignWithConnection, currentUserId?: string) {
  const isOwn = campaign.is_own !== false && (!currentUserId || campaign.user_id === currentUserId)
  return isOwn ? 'You' : (campaign.creator_name || campaign.profiles?.full_name || 'Team member')
}

function getColumns(opts: {
  onRequestDelete: (campaign: CampaignWithConnection) => void
  onRequestEdit: (campaign: CampaignWithConnection) => void
  onRequestHide: (campaign: CampaignWithConnection) => void
  onRequestUnschedule: (campaign: CampaignWithConnection) => void
  currentUserId?: string
  isTeamAdmin?: boolean
}): ColumnDef<CampaignWithConnection>[] {
  return [
    {
      id: 'account',
      enableSorting: false,
      header: () => <span>Klaviyo account</span>,
      accessorFn: (row) => row.klaviyo_connections?.account_name ?? '',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          <BrandIcon
            accountName={row.original.klaviyo_connections?.account_name}
            storeUrl={row.original.klaviyo_connections?.store_url}
            className="h-4 w-4 account-favicon"
          />
          <span className="truncate text-muted-foreground font-medium">
            {row.original.klaviyo_connections?.account_name || '—'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'name',
      enableSorting: false,
      header: () => <span>Campaign name</span>,
      cell: ({ row }) => {
        const status = row.original.status
        const isClickable = status === 'in_progress' || (status as string) === 'draft'

        if (isClickable) {
          return (
            <Link
              href={`/campaigns/${row.original.id}`}
              className="block w-full truncate font-medium hover:underline"
            >
              {row.original.name}
            </Link>
          )
        }

        return (
          <span className="block w-full truncate font-medium">
            {row.original.name}
          </span>
        )
      },
    },
    {
      id: 'created_by',
      enableSorting: false,
      header: () => <span>Created by</span>,
      cell: ({ row }) => {
        const campaign = row.original
        const displayName = getCreatorDisplayName(campaign, opts.currentUserId)
        const avatarName = campaign.creator_name || campaign.profiles?.full_name || displayName

        return (
          <div className="inline-flex items-center gap-2">
            <UserAvatar
              name={avatarName}
              imageUrl={campaign.creator_avatar_url}
              className="h-7 w-7"
              fallbackClassName="text-xs"
            />
            <span className="hidden max-w-[120px] truncate text-sm text-muted-foreground sm:inline">
              {displayName}
            </span>
          </div>
        )
      },
    },
    {
      id: 'updated_at',
      enableSorting: false,
      header: () => <span>Last updated</span>,
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground">
              {formatRelativeUpdated(row.original.updated_at)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatAbsoluteDateTime(row.original.updated_at)}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      enableSorting: false,
      header: () => <span>Status</span>,
      cell: ({ row }) => {
        const status = STATUS_CONFIG[row.original.status] || STATUS_CONFIG.in_progress
        return (
          <Badge
            variant={status.variant}
            className={`font-sans text-[12px] py-0 px-[7px] shadow-none ${status.className}`}
          >
            {status.label}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span>Actions</span>,
      cell: ({ row }) => {
        const campaign = row.original

        const isInProgress =
          campaign.status === 'in_progress' || (campaign.status as string) === 'draft'

        const isCancelled = campaign.status === 'cancelled'

        const isScheduled = campaign.status === 'scheduled'
        const isSent = campaign.status === 'sent'

        const isReadOnlyPreviewStatus = isSent || isScheduled

        const isKlaviyoDraft =
          (campaign.status === 'klaviyo_draft' || (campaign.status as string) === 'ready') &&
          !!campaign.klaviyo_campaign_id

        return (
          <div className="flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Open campaign actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                {isInProgress && (
                  <DropdownMenuItem asChild>
                    <Link href={`/campaigns/${campaign.id}`}>
                      <Pencil className="h-4 w-4 mr-1.5" />
                      Continue editing
                    </Link>
                  </DropdownMenuItem>
                )}

                {(isReadOnlyPreviewStatus || isKlaviyoDraft) && (
                  <DropdownMenuItem asChild>
                    <Link href={`/campaigns/${campaign.id}`}>
                      <Mail className="h-4 w-4 mr-1.5" />
                      View details
                    </Link>
                  </DropdownMenuItem>
                )}

                {(isScheduled || isKlaviyoDraft) && campaign.is_own !== false && (
                  <DropdownMenuItem onClick={() => opts.onRequestEdit(campaign)}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </DropdownMenuItem>
                )}

                {isScheduled && campaign.is_own !== false && (
                  <DropdownMenuItem onClick={() => opts.onRequestUnschedule(campaign)}>
                    <Clock className="h-4 w-4 mr-1.5" />
                    Unschedule
                  </DropdownMenuItem>
                )}

                {isKlaviyoDraft && (
                  <DropdownMenuItem asChild>
                    <a
                      href={`https://www.klaviyo.com/campaign/${campaign.klaviyo_campaign_id}/scheduled`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-1.5" />
                      View in Klaviyo
                    </a>
                  </DropdownMenuItem>
                )}

                {(campaign.is_own !== false || opts.isTeamAdmin) && (
                  <DropdownMenuItem onClick={() => opts.onRequestHide(campaign)}>
                    <EyeOff className="h-4 w-4 mr-1.5" />
                    {campaign.is_hidden ? 'Unhide' : 'Hide'}
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => opts.onRequestDelete(campaign)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}

const PAGE_SIZE = 20

function DataTable({
  columns,
  data,
}: {
  columns: ColumnDef<CampaignWithConnection, any>[]
  data: CampaignWithConnection[]
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: PAGE_SIZE },
    },
  })

  const pageCount = table.getPageCount()

  return (
    <>
      <TooltipProvider>
        <Table className="table-fixed min-w-[760px] sm:min-w-[860px] lg:min-w-[980px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'bg-muted/35 first:rounded-l-md last:rounded-r-md',
                      COLUMN_WIDTH_CLASSES[header.id] ?? ''
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={cn("h-[56px]", row.original.is_hidden && "opacity-50")}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(COLUMN_WIDTH_CLASSES[cell.column.id] ?? '')}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TooltipProvider>

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-2 pl-2 pr-2 pb-1">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export function CampaignList({ campaigns, currentUserId, isTeamAdmin }: CampaignListProps) {
  const [deleteModalCampaign, setDeleteModalCampaign] = React.useState<CampaignWithConnection | null>(null)
  const [editModalCampaign, setEditModalCampaign] = React.useState<CampaignWithConnection | null>(null)
  const [unscheduleModalCampaign, setUnscheduleModalCampaign] = React.useState<CampaignWithConnection | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isUnscheduling, setIsUnscheduling] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('active')
  const [sortOption, setSortOption] = React.useState<SortOption>('created_desc')
  const [showHidden, setShowHidden] = React.useState(false)
  const router = useRouter()

  const handleHide = React.useCallback(async (campaign: CampaignWithConnection) => {
    const newHidden = !campaign.is_hidden
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/hide`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: newHidden }),
      })

      if (!response.ok) throw new Error('Failed to update')

      if (newHidden) {
        toast(`${campaign.name} has been hidden`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              await fetch(`/api/campaigns/${campaign.id}/hide`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_hidden: false }),
              })
              router.refresh()
            },
          },
          classNames: {
            actionButton: '!bg-transparent !text-foreground !p-0 !h-auto !font-normal !underline !shadow-none',
          },
        })
      }

      router.refresh()
    } catch {
      toast.error('Failed to update campaign')
    }
  }, [router])

  const columns = React.useMemo(
    () =>
      getColumns({
        onRequestDelete: (c) => setDeleteModalCampaign(c),
        onRequestEdit: (c) => setEditModalCampaign(c),
        onRequestHide: (c) => handleHide(c),
        onRequestUnschedule: (c) => setUnscheduleModalCampaign(c),
        currentUserId,
        isTeamAdmin,
      }),
    [currentUserId, isTeamAdmin, handleHide]
  )

  const hasHiddenCampaigns = React.useMemo(
    () => campaigns.some((c) => c.is_hidden),
    [campaigns]
  )

  const filteredCampaigns = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    const filtered = campaigns.filter((campaign) => {
      if (!showHidden && campaign.is_hidden) return false
      if (statusFilter === 'active' && campaign.status === 'sent') return false
      if (statusFilter === 'scheduled' && campaign.status !== 'scheduled') return false
      if (statusFilter === 'sent' && campaign.status !== 'sent') return false

      if (!normalizedQuery) return true

      const campaignName = (campaign.name || '').toLowerCase()
      const accountName = (campaign.klaviyo_connections?.account_name || '').toLowerCase()
      return campaignName.includes(normalizedQuery) || accountName.includes(normalizedQuery)
    })

    const sorted = [...filtered]

    if (sortOption === 'created_desc') {
      sorted.sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
    }

    if (sortOption === 'created_asc') {
      sorted.sort((a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at))
    }

    if (sortOption === 'updated_desc') {
      sorted.sort((a, b) => toTimestamp(b.updated_at) - toTimestamp(a.updated_at))
    }

    if (sortOption === 'updated_asc') {
      sorted.sort((a, b) => toTimestamp(a.updated_at) - toTimestamp(b.updated_at))
    }

    if (sortOption === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    }

    if (sortOption === 'name_desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name))
    }

    return sorted
  }, [campaigns, searchQuery, statusFilter, sortOption, showHidden])

  const statusCounts = React.useMemo(() => {
    const visible = showHidden ? campaigns : campaigns.filter((c) => !c.is_hidden)
    return {
      active: visible.filter((campaign) => campaign.status !== 'sent').length,
      scheduled: visible.filter((campaign) => campaign.status === 'scheduled').length,
      sent: visible.filter((campaign) => campaign.status === 'sent').length,
      all: visible.length,
    }
  }, [campaigns, showHidden])

  const handleDelete = React.useCallback(async () => {
    if (!deleteModalCampaign) return

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/campaigns/${deleteModalCampaign.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete')

      setDeleteModalCampaign(null)
      router.refresh()
    } catch {
      alert('Failed to delete campaign')
    } finally {
      setIsDeleting(false)
    }
  }, [deleteModalCampaign, router])

  const handleUnschedule = React.useCallback(async () => {
    if (!unscheduleModalCampaign) return

    setIsUnscheduling(true)

    try {
      const response = await fetch(`/api/campaigns/${unscheduleModalCampaign.id}/unschedule`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to unschedule')
      }

      setUnscheduleModalCampaign(null)
      toast('Campaign unscheduled')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unschedule campaign')
    } finally {
      setIsUnscheduling(false)
    }
  }, [unscheduleModalCampaign, router])

  if (campaigns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 mb-4 bg-muted rounded-full flex items-center justify-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
          <p className="text-muted-foreground mb-4">Create your first campaign to get started</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="active">Active ({statusCounts.active})</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled ({statusCounts.scheduled})</TabsTrigger>
            <TabsTrigger value="sent">Sent ({statusCounts.sent})</TabsTrigger>
            <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by campaign or account"
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-3">
              {hasHiddenCampaigns && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowHidden((v) => !v)}
                        className={cn("h-9 w-9", showHidden && "bg-accent")}
                      >
                        {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {showHidden ? 'Hide hidden campaigns' : 'Show hidden campaigns'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="created_desc">Created on (newest)</SelectItem>
                  <SelectItem value="created_asc">Created on (oldest)</SelectItem>
                  <SelectItem value="updated_desc">Last updated (newest)</SelectItem>
                  <SelectItem value="updated_asc">Last updated (oldest)</SelectItem>
                  <SelectItem value="name_asc">Campaign name (A-Z)</SelectItem>
                  <SelectItem value="name_desc">Campaign name (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border p-2">
            <DataTable columns={columns} data={filteredCampaigns} />
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!deleteModalCampaign}
        onOpenChange={(open) => !open && !isDeleting && setDeleteModalCampaign(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>Delete campaign</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">
              &quot;{deleteModalCampaign?.name}&quot;
            </span>
            ? This will permanently remove the campaign from your Drafted account.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!unscheduleModalCampaign}
        onOpenChange={(open) => !open && !isUnscheduling && setUnscheduleModalCampaign(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <AlertDialogTitle>Unschedule campaign</AlertDialogTitle>
                <AlertDialogDescription>This will revert the campaign to draft status</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to unschedule{' '}
            <span className="font-medium text-foreground">
              &quot;{unscheduleModalCampaign?.name}&quot;
            </span>
            ? The campaign will be saved as a draft in Klaviyo and can be rescheduled later.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnscheduling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnschedule}
              disabled={isUnscheduling}
            >
              {isUnscheduling ? 'Unscheduling...' : 'Unschedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editModalCampaign && (
        <EditScheduledCampaignDialog
          campaignId={editModalCampaign.id}
          campaignName={editModalCampaign.name}
          campaignStatus={editModalCampaign.status === 'klaviyo_draft' ? 'klaviyo_draft' : 'scheduled'}
          open={!!editModalCampaign}
          onOpenChange={(open) => !open && setEditModalCampaign(null)}
        />
      )}
    </>
  )
}
