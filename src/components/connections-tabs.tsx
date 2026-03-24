'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import DOMPurify from 'dompurify'
import type { ColumnDef } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { FooterSetup } from './footer-setup'
import { DefaultAudienceSetup } from './default-audience-setup'
import { ProductFeedSetup } from './product-feed-setup'
import { UpgradePrompt } from './upgrade-prompt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { cn } from '@/lib/utils'
import { normalizeStoreUrl, validateStoreUrl } from '@/lib/store-url'
import { startFigmaOAuth as startFigmaOAuthShared, startKlaviyoOAuth as startKlaviyoOAuthShared } from '@/lib/oauth'
import { BrandIcon } from '@/components/brand-icon'
import { RefreshCw, Loader2, Trash2, AlertCircle, Eye, Pencil, MoreVertical, Plus, Users, Settings, Share2, Search, ShoppingBag, Monitor, Smartphone } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface KlaviyoConnection {
  id: string
  account_name: string | null
  store_url?: string | null
  klaviyo_account_id: string | null
  hasFooter: boolean
  hasDefaultAudience: boolean
  hasProductFeedPreset: boolean
  created_at: string
  user_id: string
  is_shared: boolean
  isOwn: boolean
  ownerName: string
}

interface FigmaConnection {
  id: string
  figma_email: string | null
  created_at: string
}

type SubscriptionTier = 'starter' | 'advanced' | 'pro'

interface ConnectionsTabsProps {
  connections: KlaviyoConnection[]
  figmaConnection: FigmaConnection | null
  connectionLimit: number
  currentTier: string | null
  isTeamAdmin?: boolean
  currentUserId?: string
}

type ConnectionStatus = 'active' | 'expired' | 'error' | 'checking' | 'unknown'

type SortOption =
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc'
  | 'owner_asc'
  | 'owner_desc'

const COLUMN_WIDTH_CLASSES: Record<string, string> = {
  select: 'w-[40px]',
  name: 'w-[180px] sm:w-[220px] lg:w-[260px]',
  owner: 'w-[100px] sm:w-[120px] lg:w-[140px]',
  status: 'w-[90px]',
  footer: 'w-[70px]',
  audience: 'w-[80px]',
  shared: 'w-[80px]',
  created: 'w-[100px] sm:w-[110px]',
  actions: 'w-[56px] sm:w-[64px]',
}

function toTimestamp(value: unknown) {
  const date = new Date(String(value ?? ''))
  const timestamp = date.getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function ConnectionsTabs({
  connections,
  figmaConnection,
  connectionLimit,
  currentTier,
  isTeamAdmin = false,
  currentUserId = '',
}: ConnectionsTabsProps) {
  const [accountName, setAccountName] = useState('')
  const [storeUrl, setStoreUrl] = useState('')
  const [addFormError, setAddFormError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [shareOnAdd, setShareOnAdd] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'klaviyo' | 'figma'; id: string; name: string } | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkSharing, setIsBulkSharing] = useState(false)
  const [footerSetupConnection, setFooterSetupConnection] = useState<KlaviyoConnection | null>(null)
  const [defaultAudienceConnection, setDefaultAudienceConnection] = useState<KlaviyoConnection | null>(null)
  const [productFeedConnection, setProductFeedConnection] = useState<KlaviyoConnection | null>(null)
  const [footerPreviewConnection, setFooterPreviewConnection] = useState<KlaviyoConnection | null>(null)
  const [footerPreviewHtml, setFooterPreviewHtml] = useState<string | null>(null)
  const [footerPreviewCss, setFooterPreviewCss] = useState<string | null>(null)
  const [footerPreviewSourceUrl, setFooterPreviewSourceUrl] = useState<string | null>(null)
  const [footerPreviewLoading, setFooterPreviewLoading] = useState(false)
  const [footerPreviewError, setFooterPreviewError] = useState<string | null>(null)
  const [footerPreviewMode, setFooterPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const [showLimitError, setShowLimitError] = useState(false)
  const [isPostOAuthSetup, setIsPostOAuthSetup] = useState(false)
  const [activeTab, setActiveTab] = useState('klaviyo')
  const [settingsConnection, setSettingsConnection] = useState<KlaviyoConnection | null>(null)
  const [settingsAccountName, setSettingsAccountName] = useState('')
  const [settingsStoreUrl, setSettingsStoreUrl] = useState('')
  const [settingsIsShared, setSettingsIsShared] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>('created_desc')
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  const connectionsSubscriptions = useMemo(() => [
    { table: 'klaviyo_connections', events: ['INSERT', 'UPDATE', 'DELETE'] as const },
    { table: 'klaviyo_footers', events: ['INSERT', 'UPDATE', 'DELETE'] as const },
    { table: 'klaviyo_default_audiences', events: ['INSERT', 'UPDATE', 'DELETE'] as const },
    { table: 'product_feed_presets', events: ['INSERT', 'UPDATE', 'DELETE'] as const },
  ], [])

  useRealtimeSubscription({
    subscriptions: connectionsSubscriptions,
    currentUserId,
    enabled: !!currentUserId,
  })

  // Check for limit_reached error from OAuth callback
  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'limit_reached') {
      setShowLimitError(true)
      const url = new URL(window.location.href)
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.toString())
    }
    if (error === 'invalid_store_url') {
      setShowAddForm(true)
      setAddFormError('Please enter a valid store URL before connecting Klaviyo.')
      const url = new URL(window.location.href)
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  // Auto-trigger footer setup after successful OAuth connection
  useEffect(() => {
    const success = searchParams.get('success')
    const newConnectionId = searchParams.get('newConnectionId')

    if (success === 'klaviyo_connected' && newConnectionId) {
      const matchingConnection = connections.find(c => c.id === newConnectionId)
      if (matchingConnection && !matchingConnection.hasFooter) {
        setFooterSetupConnection(matchingConnection)
        setIsPostOAuthSetup(true)
      }

      const url = new URL(window.location.href)
      url.searchParams.delete('success')
      url.searchParams.delete('newConnectionId')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams, connections])

  useEffect(() => {
    if (!footerPreviewConnection) return
    let isActive = true
    const fetchFooter = async () => {
      setFooterPreviewLoading(true)
      setFooterPreviewError(null)
      setFooterPreviewHtml(null)
      setFooterPreviewCss(null)
      setFooterPreviewSourceUrl(null)
      setFooterPreviewMode('desktop')

      try {
        const response = await fetch(`/api/klaviyo/footer?connectionId=${footerPreviewConnection.id}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch footer')
        }

        if (!isActive) return
        setFooterPreviewHtml(data.footer?.footer_html || null)
        setFooterPreviewCss(data.footer?.footer_css || null)
        setFooterPreviewSourceUrl(data.footer?.source_url || null)
      } catch (err) {
        if (!isActive) return
        setFooterPreviewError(err instanceof Error ? err.message : 'Failed to fetch footer')
      } finally {
        if (!isActive) return
        setFooterPreviewLoading(false)
      }
    }

    fetchFooter()
    return () => {
      isActive = false
    }
  }, [footerPreviewConnection])

  const ownConnectionCount = connections.filter(c => c.isOwn).length
  const isAtLimit = ownConnectionCount >= connectionLimit
  const canAddConnection = connectionLimit > 0 && !isAtLimit

  const refreshConnectionStatuses = async () => {
    setIsRefreshing(true)

    const checkingStatuses: Record<string, ConnectionStatus> = {}
    connections.forEach(conn => {
      checkingStatuses[conn.id] = 'checking'
    })
    if (figmaConnection) {
      checkingStatuses[figmaConnection.id] = 'checking'
    }
    setConnectionStatuses(checkingStatuses)

    try {
      const [klaviyoResponse, figmaResponse] = await Promise.all([
        connections.length > 0 ? fetch('/api/connections/klaviyo/status') : Promise.resolve(null),
        figmaConnection ? fetch('/api/connections/figma/status') : Promise.resolve(null),
      ])

      const newStatuses: Record<string, ConnectionStatus> = {}

      if (klaviyoResponse?.ok) {
        const { statuses } = await klaviyoResponse.json()
        statuses.forEach((s: { id: string; status: ConnectionStatus }) => {
          newStatuses[s.id] = s.status
        })
      }

      if (figmaResponse?.ok) {
        const { status } = await figmaResponse.json()
        if (status) {
          newStatuses[status.id] = status.status
        }
      }

      setConnectionStatuses(newStatuses)
    } catch (err) {
      console.error('Failed to refresh statuses:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const startKlaviyoOAuth = () => {
    const error = startKlaviyoOAuthShared(accountName, storeUrl, isTeamAdmin ? shareOnAdd : undefined)
    if (error) {
      setAddFormError(error)
    } else {
      setAddFormError(null)
    }
  }

  const startFigmaOAuth = () => {
    startFigmaOAuthShared()
  }

  const confirmDelete = (type: 'klaviyo' | 'figma', id: string, name: string) => {
    setDeleteConfirm({ type, id, name })
  }

  const deleteConnection = async () => {
    if (!deleteConfirm) return

    setDeletingId(deleteConfirm.id)

    try {
      const response = await fetch(`/api/connections/${deleteConfirm.type}/${deleteConfirm.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      setDeleteConfirm(null)
      router.refresh()
    } catch (err) {
      alert('Failed to remove connection')
    } finally {
      setDeletingId(null)
    }
  }

  const sortedConnections = useMemo(() => {
    const sorted = [...connections]
    if (sortOption === 'created_desc') sorted.sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
    if (sortOption === 'created_asc') sorted.sort((a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at))
    if (sortOption === 'name_asc') sorted.sort((a, b) => (a.account_name || '').localeCompare(b.account_name || ''))
    if (sortOption === 'name_desc') sorted.sort((a, b) => (b.account_name || '').localeCompare(a.account_name || ''))
    if (sortOption === 'owner_asc') sorted.sort((a, b) => a.ownerName.localeCompare(b.ownerName))
    if (sortOption === 'owner_desc') sorted.sort((a, b) => b.ownerName.localeCompare(a.ownerName))
    return sorted
  }, [connections, sortOption])

  const selectedConnectionIds = useMemo(() => {
    return Object.keys(rowSelection).filter(key => rowSelection[key]).map(idx => {
      const connection = sortedConnections[parseInt(idx)]
      return connection?.id
    }).filter(Boolean) as string[]
  }, [rowSelection, sortedConnections])

  const selectedOwnIds = useMemo(() => {
    return selectedConnectionIds.filter(id => {
      const conn = connections.find(c => c.id === id)
      return conn?.isOwn
    })
  }, [selectedConnectionIds, connections])

  const handleBulkDelete = async () => {
    if (selectedConnectionIds.length === 0) return
    setIsBulkDeleting(true)

    try {
      const response = await fetch('/api/connections/klaviyo/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', connectionIds: selectedConnectionIds }),
      })

      if (!response.ok) throw new Error('Failed to delete')

      setRowSelection({})
      setBulkDeleteConfirm(false)
      router.refresh()
    } catch {
      alert('Failed to delete connections')
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleBulkShare = async (share: boolean) => {
    if (selectedOwnIds.length === 0) return
    setIsBulkSharing(true)

    try {
      const response = await fetch('/api/connections/klaviyo/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: share ? 'share' : 'unshare',
          connectionIds: selectedOwnIds,
        }),
      })

      if (!response.ok) throw new Error('Failed to update sharing')

      setRowSelection({})
      router.refresh()
    } catch {
      alert('Failed to update sharing')
    } finally {
      setIsBulkSharing(false)
    }
  }

  const getStatusBadge = (connectionId: string) => {
    const status = connectionStatuses[connectionId]
    if (!status || status === 'unknown') return null

    if (status === 'checking') {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking
        </Badge>
      )
    }

    if (status === 'active') {
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1" />
          Active
        </Badge>
      )
    }

    if (status === 'expired') {
      return (
        <Badge variant="destructive">
          <span className="w-1.5 h-1.5 bg-red-300 rounded-full mr-1" />
          Expired
        </Badge>
      )
    }

    return (
      <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100">
        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1" />
        Error
      </Badge>
    )
  }

  const sanitizeHtml = (html: string) => {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'rel'],
    })
  }

  const openSettingsSheet = (connection: KlaviyoConnection) => {
    setSettingsConnection(connection)
    setSettingsAccountName(connection.account_name || '')
    setSettingsStoreUrl(connection.store_url || '')
    setSettingsIsShared(connection.is_shared)
    setSettingsError(null)
  }

  const closeSettingsSheet = () => {
    setSettingsConnection(null)
    setSettingsAccountName('')
    setSettingsStoreUrl('')
    setSettingsIsShared(false)
    setSettingsError(null)
  }

  const saveConnectionSettings = async () => {
    if (!settingsConnection) return

    const nextAccountName = settingsAccountName.trim()
    if (!nextAccountName) {
      setSettingsError('Please enter an account name')
      return
    }

    const storeValidation = validateStoreUrl(settingsStoreUrl)
    if (!storeValidation.valid) {
      setSettingsError(storeValidation.error)
      return
    }

    setIsSavingSettings(true)
    setSettingsError(null)

    try {
      const body: Record<string, unknown> = {
        accountName: nextAccountName,
        storeUrl: storeValidation.normalized,
      }

      // Only include isShared if this is the user's own connection and they're an admin
      if (settingsConnection.isOwn && isTeamAdmin) {
        body.isShared = settingsIsShared
      }

      const response = await fetch(`/api/connections/klaviyo/${settingsConnection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update details')
      }

      closeSettingsSheet()
      router.refresh()
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to update details')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const columns = useMemo<ColumnDef<KlaviyoConnection>[]>(() => [
    {
      id: 'select',
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => {
        const conn = row.original
        const canSelect = conn.isOwn || isTeamAdmin
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            disabled={!canSelect}
            aria-label="Select row"
          />
        )
      },
    },
    {
      id: 'name',
      accessorKey: 'account_name',
      enableSorting: false,
      header: () => <span>Account name</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          <BrandIcon
            accountName={row.original.account_name}
            storeUrl={row.original.store_url}
            className="h-4 w-4 account-favicon flex-shrink-0"
          />
          <span className="truncate text-muted-foreground font-medium">
            {row.original.account_name || 'Unnamed account'}
          </span>
        </div>
      ),
    },
    {
      id: 'owner',
      accessorKey: 'ownerName',
      enableSorting: false,
      header: () => <span>Owner</span>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.ownerName}
        </span>
      ),
    },
    {
      id: 'status',
      enableSorting: false,
      header: () => <span>Status</span>,
      cell: ({ row }) => getStatusBadge(row.original.id) || (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    },
    {
      id: 'footer',
      enableSorting: false,
      header: () => <span>Footer</span>,
      cell: ({ row }) => (
        <span className={cn(
          'inline-block w-2 h-2 rounded-full',
          row.original.hasFooter ? 'bg-green-500' : 'bg-muted-foreground/30'
        )} />
      ),
    },
    {
      id: 'audience',
      enableSorting: false,
      header: () => <span>Audience</span>,
      cell: ({ row }) => (
        <span className={cn(
          'inline-block w-2 h-2 rounded-full',
          row.original.hasDefaultAudience ? 'bg-blue-500' : 'bg-muted-foreground/30'
        )} />
      ),
    },
    {
      id: 'shared',
      enableSorting: false,
      header: () => <span>Shared</span>,
      cell: ({ row }) => {
        if (!row.original.isOwn) {
          return row.original.is_shared ? (
            <Badge variant="secondary" className="text-xs">Shared</Badge>
          ) : null
        }
        return row.original.is_shared ? (
          <Badge variant="secondary" className="text-xs">Shared</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Private</span>
        )
      },
    },
    {
      id: 'created',
      accessorKey: 'created_at',
      enableSorting: false,
      header: () => <span>Created</span>,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString('en-GB')}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span>Actions</span>,
      cell: ({ row }) => {
        const conn = row.original
        const canEdit = conn.isOwn || isTeamAdmin
        return (
          <div className="flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Open connection actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={() => openSettingsSheet(conn)}>
                    <Settings className="h-4 w-4 mr-1.5" />
                    General settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setFooterPreviewConnection(conn)}
                  disabled={!conn.hasFooter}
                >
                  <Eye className="h-4 w-4 mr-1.5" />
                  View footer
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={() => setFooterSetupConnection(conn)}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    {conn.hasFooter ? 'Update footer' : 'Set up footer'}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setDefaultAudienceConnection(conn)}>
                    <Users className="h-4 w-4 mr-1.5" />
                    {conn.hasDefaultAudience ? 'Edit default audience' : 'Set default audience'}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setProductFeedConnection(conn)}>
                    <ShoppingBag className="h-4 w-4 mr-1.5" />
                    {conn.hasProductFeedPreset ? 'Edit product feed style' : 'Set up product feed'}
                  </DropdownMenuItem>
                )}
                {conn.isOwn && isTeamAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        await fetch(`/api/connections/klaviyo/${conn.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            accountName: conn.account_name || 'Unnamed account',
                            storeUrl: conn.store_url || '',
                            isShared: !conn.is_shared,
                          }),
                        })
                        router.refresh()
                      }}
                    >
                      <Share2 className="h-4 w-4 mr-1.5" />
                      {conn.is_shared ? 'Unshare with team' : 'Share with team'}
                    </DropdownMenuItem>
                  </>
                )}
                {canEdit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => confirmDelete('klaviyo', conn.id, conn.account_name || 'Unnamed account')}
                      disabled={deletingId === conn.id}
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      {deletingId === conn.id ? 'Removing...' : 'Delete connection'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ], [connectionStatuses, isTeamAdmin, deletingId, router])

  const table = useReactTable({
    data: sortedConnections,
    columns,
    state: {
      rowSelection,
      globalFilter,
    },
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: (row) => row.original.isOwn || isTeamAdmin,
    globalFilterFn: (row, _columnId, filterValue) => {
      const name = (row.original.account_name || '').toLowerCase()
      return name.includes(filterValue.toLowerCase())
    },
  })

  const selectedCount = Object.values(rowSelection).filter(Boolean).length

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your Klaviyo and Figma integrations
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(connections.length > 0 || figmaConnection) && (
            <Button
              variant="outline"
              size="icon"
              onClick={refreshConnectionStatuses}
              disabled={isRefreshing}
              aria-label="Check connection status"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {activeTab === 'klaviyo' ? (
            canAddConnection ? (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4" />
                Add Klaviyo account
              </Button>
            ) : currentTier !== 'pro' ? (
              <Button
                variant="outline"
                onClick={() => setShowUpgradePrompt(true)}
              >
                Upgrade to add more
              </Button>
            ) : null
          ) : (
            !figmaConnection && (
              <Button onClick={startFigmaOAuth}>
                <Plus className="h-4 w-4" />
                Connect Figma
              </Button>
            )
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="klaviyo">
            Klaviyo ({connections.length})
          </TabsTrigger>
          <TabsTrigger value="figma">
            Figma ({figmaConnection ? 1 : 0})
          </TabsTrigger>
        </TabsList>

        {/* Klaviyo tab content */}
        <TabsContent value="klaviyo" className="space-y-4">
          {/* Connection limit indicator */}
          {connectionLimit > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Klaviyo accounts: <span className="font-medium text-foreground">{ownConnectionCount} / {connectionLimit}</span>
                </span>
                {isAtLimit && currentTier !== 'pro' && (
                  <Badge variant="outline" className="text-amber-600 border-amber-600">
                    At limit
                  </Badge>
                )}
              </div>
              {isAtLimit && currentTier !== 'pro' && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setShowUpgradePrompt(true)}
                >
                  Upgrade for more
                </Button>
              )}
            </div>
          )}

          {/* Limit reached error alert */}
          {showLimitError && (
            <div className="flex items-start gap-3 p-6 border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-200">Connection limit reached</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  You&apos;ve reached your limit of {connectionLimit} Klaviyo account{connectionLimit !== 1 ? 's' : ''}.
                  {currentTier !== 'pro' && ' Upgrade your plan to connect more accounts.'}
                </p>
              </div>
              <div className="flex gap-2">
                {currentTier !== 'pro' && (
                  <Button size="sm" onClick={() => setShowUpgradePrompt(true)}>
                    Upgrade
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLimitError(false)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {/* Search + Sort / Bulk actions */}
          {connections.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    placeholder="Search by account name"
                    className="pl-9"
                  />
                </div>

                {selectedCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {selectedCount} selected
                    </span>
                    {isTeamAdmin && selectedOwnIds.length > 0 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBulkShare(true)}
                          disabled={isBulkSharing}
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1.5" />
                          Share
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBulkShare(false)}
                          disabled={isBulkSharing}
                        >
                          Unshare
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBulkDeleteConfirm(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRowSelection({})}
                    >
                      Clear
                    </Button>
                  </div>
                ) : (
                  <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="created_desc">Created on (newest)</SelectItem>
                      <SelectItem value="created_asc">Created on (oldest)</SelectItem>
                      <SelectItem value="name_asc">Account name (A-Z)</SelectItem>
                      <SelectItem value="name_desc">Account name (Z-A)</SelectItem>
                      <SelectItem value="owner_asc">Owner (A-Z)</SelectItem>
                      <SelectItem value="owner_desc">Owner (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Data table */}
              <div className="rounded-md border p-2">
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
                        <TableRow key={row.id} className="h-[56px]">
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
                          No connections found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {connections.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No Klaviyo accounts connected. Click the button above to get started.
              </p>
            </div>
          )}

          {/* Add connection dialog */}
          <Dialog
            open={showAddForm}
            onOpenChange={(open) => {
              setShowAddForm(open)
              if (!open) {
                setAccountName('')
                setStoreUrl('')
                setAddFormError(null)
                setShareOnAdd(true)
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Klaviyo account</DialogTitle>
                <DialogDescription>
                  Connect a new account to sync campaigns, templates, and images.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="account-name">Account name</Label>
                  <Input
                    id="account-name"
                    type="text"
                    value={accountName}
                    onChange={(e) => {
                      setAccountName(e.target.value)
                      if (addFormError) setAddFormError(null)
                    }}
                    placeholder="e.g., Client A, My Store"
                  />
                  <p className="text-xs text-muted-foreground">
                    Give this connection a name so you can identify it later
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store-url">Store URL</Label>
                  <Input
                    id="store-url"
                    type="text"
                    value={storeUrl}
                    onChange={(e) => {
                      setStoreUrl(e.target.value)
                      if (addFormError) setAddFormError(null)
                    }}
                    onBlur={(e) => {
                      const normalized = normalizeStoreUrl(e.target.value)
                      if (normalized) setStoreUrl(normalized)
                    }}
                    placeholder="e.g., yourstore.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    We use this for link placeholders and your brand favicon.
                  </p>
                </div>
                {isTeamAdmin && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="share-toggle" className="text-sm font-medium">Share with team</Label>
                      <p className="text-xs text-muted-foreground">
                        Make this connection available to all team members
                      </p>
                    </div>
                    <Switch
                      id="share-toggle"
                      checked={shareOnAdd}
                      onCheckedChange={setShareOnAdd}
                    />
                  </div>
                )}
                {addFormError && (
                  <p className="text-sm text-destructive">{addFormError}</p>
                )}
                <div className="flex gap-3">
                  <Button
                    onClick={startKlaviyoOAuth}
                    disabled={!accountName.trim() || !storeUrl.trim()}
                  >
                    Connect to Klaviyo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddForm(false)
                      setAccountName('')
                      setStoreUrl('')
                      setAddFormError(null)
                      setShareOnAdd(true)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Figma tab content */}
        <TabsContent value="figma" className="space-y-6">
          {figmaConnection ? (
            <Card>
              <CardContent className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">Connected account</p>
                        <p className="font-medium">{figmaConnection.figma_email || 'Email unavailable'}</p>
                        <p className="text-xs text-muted-foreground">
                          Added {new Date(figmaConnection.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      {getStatusBadge(figmaConnection.id)}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Open connection actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => confirmDelete('figma', figmaConnection.id, figmaConnection.figma_email || 'Figma account')}
                          disabled={deletingId === figmaConnection.id}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 mr-1.5" />
                          {deletingId === figmaConnection.id ? 'Removing...' : 'Delete connection'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No Figma account connected. Click the button above to get started.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Settings sheet */}
      <Sheet
        open={!!settingsConnection}
        onOpenChange={(open) => {
          if (!open && !isSavingSettings) {
            closeSettingsSheet()
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>General settings</SheetTitle>
            <SheetDescription>
              Update the connection name and store URL.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="settings-account-name">Account name</Label>
              <Input
                id="settings-account-name"
                type="text"
                value={settingsAccountName}
                onChange={(e) => {
                  setSettingsAccountName(e.target.value)
                  if (settingsError) setSettingsError(null)
                }}
                disabled={isSavingSettings}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-store-url">Store URL</Label>
              <Input
                id="settings-store-url"
                type="text"
                value={settingsStoreUrl}
                onChange={(e) => {
                  setSettingsStoreUrl(e.target.value)
                  if (settingsError) setSettingsError(null)
                }}
                onBlur={(e) => {
                  const normalized = normalizeStoreUrl(e.target.value)
                  if (normalized) setSettingsStoreUrl(normalized)
                }}
                placeholder="e.g., yourstore.com"
                disabled={isSavingSettings}
              />
            </div>

            {settingsConnection?.isOwn && isTeamAdmin && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="settings-share-toggle" className="text-sm font-medium">Share with team</Label>
                  <p className="text-xs text-muted-foreground">
                    Make this connection visible to team members
                  </p>
                </div>
                <Switch
                  id="settings-share-toggle"
                  checked={settingsIsShared}
                  onCheckedChange={setSettingsIsShared}
                  disabled={isSavingSettings}
                />
              </div>
            )}

            {settingsError && (
              <p className="text-sm text-destructive">{settingsError}</p>
            )}
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={closeSettingsSheet}
              disabled={isSavingSettings}
            >
              Cancel
            </Button>
            <Button
              onClick={saveConnectionSettings}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? 'Saving...' : 'Save changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Footer Setup Modal */}
      {footerSetupConnection && (
        <FooterSetup
          connectionId={footerSetupConnection.id}
          hasFooter={footerSetupConnection.hasFooter}
          isPostOAuth={isPostOAuthSetup}
          onComplete={() => {
            setFooterSetupConnection(null)
            setIsPostOAuthSetup(false)
            window.dispatchEvent(new CustomEvent('footer-setup-complete'))
            router.refresh()
          }}
          onCancel={() => {
            setFooterSetupConnection(null)
            setIsPostOAuthSetup(false)
          }}
          onSkip={() => {
            setFooterSetupConnection(null)
            setIsPostOAuthSetup(false)
          }}
        />
      )}

      {defaultAudienceConnection && (
        <DefaultAudienceSetup
          connectionId={defaultAudienceConnection.id}
          connectionName={defaultAudienceConnection.account_name || 'Unnamed account'}
          onComplete={() => {
            setDefaultAudienceConnection(null)
            router.refresh()
          }}
          onCancel={() => {
            setDefaultAudienceConnection(null)
          }}
        />
      )}

      {productFeedConnection && (
        <ProductFeedSetup
          connectionId={productFeedConnection.id}
          hasPreset={productFeedConnection.hasProductFeedPreset}
          onComplete={() => {
            setProductFeedConnection(null)
            router.refresh()
          }}
          onCancel={() => {
            setProductFeedConnection(null)
          }}
        />
      )}

      {/* Footer Preview Modal */}
      <Dialog
        open={!!footerPreviewConnection}
        onOpenChange={(open) => {
          if (!open) {
            setFooterPreviewConnection(null)
            setFooterPreviewHtml(null)
            setFooterPreviewCss(null)
            setFooterPreviewSourceUrl(null)
            setFooterPreviewError(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Footer Preview</DialogTitle>
            <DialogDescription>
              {footerPreviewConnection?.account_name || 'Klaviyo account'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {footerPreviewLoading && (
              <div className="text-sm text-muted-foreground">Loading footer...</div>
            )}
            {footerPreviewError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {footerPreviewError}
              </div>
            )}
            {!footerPreviewLoading && !footerPreviewError && !footerPreviewHtml && (
              <div className="text-sm text-muted-foreground">No footer is installed for this account.</div>
            )}
            {footerPreviewHtml && (
              <>
                <div className="flex items-center justify-center mb-4">
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setFooterPreviewMode('desktop')}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                        footerPreviewMode === 'desktop'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Monitor className="h-4 w-4" />
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setFooterPreviewMode('mobile')}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                        footerPreviewMode === 'mobile'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Smartphone className="h-4 w-4" />
                      Mobile
                    </button>
                  </div>
                </div>
                <div className="flex justify-center">
                  <div
                    className="border rounded-lg overflow-hidden bg-white transition-all duration-300 ease-in-out"
                    style={{ width: footerPreviewMode === 'desktop' ? 600 : 375 }}
                  >
                    <iframe
                      srcDoc={`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { margin: 0; padding: 0; background: #fff; }
table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
${footerPreviewCss || ''}
</style>
</head>
<body>
<div class="email-footer">
${footerPreviewHtml}
</div>
</body></html>`}
                      title="Footer preview"
                      className="w-full border-0"
                      style={{ minHeight: 200 }}
                      sandbox="allow-same-origin"
                      onLoad={(e) => {
                        const iframe = e.currentTarget
                        try {
                          const doc = iframe.contentDocument
                          if (doc) {
                            iframe.style.height = `${doc.documentElement.scrollHeight}px`
                          }
                        } catch {
                          // cross-origin safety
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            )}
            {footerPreviewSourceUrl && (
              <p className="text-xs text-muted-foreground mt-3">
                Source: <span className="font-mono">{footerPreviewSourceUrl}</span>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Single delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && !deletingId && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>Remove connection</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove <span className="font-medium text-foreground">&quot;{deleteConfirm?.name}&quot;</span>? You will need to reconnect this account to use it again.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteConnection}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && !isBulkDeleting && setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>Remove {selectedConnectionIds.length} connection{selectedConnectionIds.length !== 1 ? 's' : ''}</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove {selectedConnectionIds.length} connection{selectedConnectionIds.length !== 1 ? 's' : ''}? You will need to reconnect these accounts to use them again.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade prompt modal */}
      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        currentTier={currentTier as SubscriptionTier | null}
        currentLimit={connectionLimit}
        currentCount={ownConnectionCount}
      />
    </div>
  )
}
