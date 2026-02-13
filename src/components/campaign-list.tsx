'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { Campaign } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/user-avatar'
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
import { MoreVertical, Pencil, Trash2, Mail, ExternalLink, ArrowUpDown } from 'lucide-react'

interface CampaignWithConnection extends Campaign {
  klaviyo_connections?: {
    account_name: string | null
  } | null
  profiles?: { full_name: string | null } | null
  is_own?: boolean
  creator_name?: string | null
  creator_avatar_url?: string | null
}

interface CampaignListProps {
  campaigns: CampaignWithConnection[]
  searchQuery?: string
  currentUserId?: string
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

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

function formatDateSafe(value: unknown) {
  const d = new Date(String(value ?? ''))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB')
}

function getCreatorDisplayName(campaign: CampaignWithConnection, currentUserId?: string) {
  const isOwn = campaign.is_own !== false && (!currentUserId || campaign.user_id === currentUserId)
  return isOwn ? 'You' : (campaign.creator_name || campaign.profiles?.full_name || 'Team member')
}

/**
 * Make "Created" the only sortable column:
 * - only Created header toggles sorting
 * - other columns are not clickable and explicitly disable sorting
 */
function getColumns(opts: {
  onRequestDelete: (campaign: CampaignWithConnection) => void
  onRequestEdit: (campaign: CampaignWithConnection) => void
  currentUserId?: string
}): ColumnDef<CampaignWithConnection>[] {
  return [
    {
      accessorKey: 'name',
      enableSorting: false,
      header: () => <span className="-mx-2 block px-4">Campaign</span>,
      cell: ({ row }) => (
        <Link
          href={`/campaigns/${row.original.id}`}
          className="-mx-2 block max-w-[520px] truncate px-4 font-medium hover:underline"
        >
          {row.original.name}
        </Link>
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
      id: 'account',
      enableSorting: false,
      header: () => <span>Account</span>,
      accessorFn: (row) => row.klaviyo_connections?.account_name ?? '',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.klaviyo_connections?.account_name || '—'}
        </span>
      ),
    },
    {
      id: 'created_by',
      enableSorting: false,
      header: () => <span>Created by</span>,
      cell: ({ row }) => {
        const campaign = row.original
        const displayName = getCreatorDisplayName(campaign, opts.currentUserId)
        const tooltipLabel = displayName === 'You' ? 'You' : displayName
        const avatarName = campaign.creator_name || campaign.profiles?.full_name || displayName

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex w-fit cursor-default">
                <UserAvatar
                  name={avatarName}
                  imageUrl={campaign.creator_avatar_url}
                  className="h-7 w-7"
                  fallbackClassName="text-xs"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>{tooltipLabel}</TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      id: 'created_at',
      enableSorting: true,
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      // Use numeric timestamp for correct sorting
      accessorFn: (row) => {
        const d = new Date(String(row.created_at ?? ''))
        const t = d.getTime()
        return Number.isNaN(t) ? 0 : t
      },
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDateSafe(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
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
          <div className="flex items-center justify-end gap-2">
            {isInProgress && (
              <Button variant="secondary" asChild>
                <Link href={`/campaigns/${campaign.id}`}>Continue editing</Link>
              </Button>
            )}

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
                {!isReadOnlyPreviewStatus && !isInProgress && !isCancelled && (
                  <DropdownMenuItem asChild>
                    <Link href={`/campaigns/${campaign.id}`}>
                      <Pencil className="h-4 w-4 mr-1.5" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                )}

                {isReadOnlyPreviewStatus && (
                  <DropdownMenuItem asChild>
                    <Link href={`/campaigns/${campaign.id}`}>
                      <Mail className="h-4 w-4 mr-1.5" />
                      View details
                    </Link>
                  </DropdownMenuItem>
                )}

                {isScheduled && campaign.is_own !== false && (
                  <DropdownMenuItem onClick={() => opts.onRequestEdit(campaign)}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
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

function DataTable({
  columns,
  data,
  searchQuery,
}: {
  columns: ColumnDef<CampaignWithConnection, any>[]
  data: CampaignWithConnection[]
  searchQuery: string
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  React.useEffect(() => {
    table.getColumn('name')?.setFilterValue(searchQuery)
  }, [searchQuery, table])

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
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
                  <TableRow key={row.id} className="h-[52px]">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
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
        </div>
      </div>
    </TooltipProvider>
  )
}

export function CampaignList({ campaigns, searchQuery = '', currentUserId }: CampaignListProps) {
  const [deleteModalCampaign, setDeleteModalCampaign] = React.useState<CampaignWithConnection | null>(null)
  const [editModalCampaign, setEditModalCampaign] = React.useState<CampaignWithConnection | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const router = useRouter()

  const columns = React.useMemo(
    () =>
      getColumns({
        onRequestDelete: (c) => setDeleteModalCampaign(c),
        onRequestEdit: (c) => setEditModalCampaign(c),
        currentUserId,
      }),
    [currentUserId]
  )

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
      <DataTable columns={columns} data={campaigns} searchQuery={searchQuery} />

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

      {editModalCampaign && (
        <EditScheduledCampaignDialog
          campaignId={editModalCampaign.id}
          campaignName={editModalCampaign.name}
          open={!!editModalCampaign}
          onOpenChange={(open) => !open && setEditModalCampaign(null)}
        />
      )}
    </>
  )
}
