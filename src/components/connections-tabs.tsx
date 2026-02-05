'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FooterSetup } from './footer-setup'
import { UpgradePrompt } from './upgrade-prompt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { RefreshCw, Loader2, Trash2, AlertCircle } from 'lucide-react'

interface KlaviyoConnection {
  id: string
  account_name: string | null
  klaviyo_account_id: string | null
  hasFooter: boolean
  created_at: string
  isShared?: boolean
  owner_name?: string
}

interface FigmaConnection {
  id: string
  figma_email: string | null
  created_at: string
}

type SubscriptionTier = 'starter' | 'advanced' | 'pro'

interface ConnectionsTabsProps {
  klaviyoConnections: KlaviyoConnection[]
  teamConnections?: KlaviyoConnection[]
  figmaConnection: FigmaConnection | null
  connectionLimit: number
  currentTier: string | null
}

type ConnectionStatus = 'active' | 'expired' | 'error' | 'checking' | 'unknown'

export function ConnectionsTabs({ klaviyoConnections, teamConnections = [], figmaConnection, connectionLimit, currentTier }: ConnectionsTabsProps) {
  const [accountName, setAccountName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'klaviyo' | 'figma'; id: string; name: string } | null>(null)
  const [footerSetupConnection, setFooterSetupConnection] = useState<KlaviyoConnection | null>(null)
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const [showLimitError, setShowLimitError] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Check for limit_reached error from OAuth callback
  useEffect(() => {
    if (searchParams.get('error') === 'limit_reached') {
      setShowLimitError(true)
      // Clean up URL
      const url = new URL(window.location.href)
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  const connectionCount = klaviyoConnections.length
  const isAtLimit = connectionCount >= connectionLimit
  const canAddConnection = connectionLimit > 0 && !isAtLimit

  const refreshConnectionStatuses = async () => {
    setIsRefreshing(true)

    const checkingStatuses: Record<string, ConnectionStatus> = {}
    klaviyoConnections.forEach(conn => {
      checkingStatuses[conn.id] = 'checking'
    })
    if (figmaConnection) {
      checkingStatuses[figmaConnection.id] = 'checking'
    }
    setConnectionStatuses(checkingStatuses)

    try {
      const [klaviyoResponse, figmaResponse] = await Promise.all([
        klaviyoConnections.length > 0 ? fetch('/api/connections/klaviyo/status') : Promise.resolve(null),
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
    if (!accountName.trim()) {
      alert('Please enter an account name')
      return
    }

    document.cookie = `klaviyo_account_name=${encodeURIComponent(accountName.trim())}; path=/; max-age=600; SameSite=Lax`

    const codeVerifier = generateCodeVerifier()
    document.cookie = `klaviyo_code_verifier=${codeVerifier}; path=/; max-age=600; SameSite=Lax`

    generateCodeChallenge(codeVerifier).then((codeChallenge) => {
      const state = crypto.randomUUID()
      document.cookie = `klaviyo_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID!,
        redirect_uri: process.env.NEXT_PUBLIC_KLAVIYO_REDIRECT_URI!,
        scope: 'accounts:read images:write templates:read templates:write lists:read segments:read campaigns:write campaigns:read',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      })

      window.location.href = `https://www.klaviyo.com/oauth/authorize?${params.toString()}`
    })
  }

  const startFigmaOAuth = () => {
    const state = crypto.randomUUID()
    document.cookie = `figma_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_FIGMA_CLIENT_ID!,
      redirect_uri: process.env.NEXT_PUBLIC_FIGMA_REDIRECT_URI!,
      scope: 'file_content:read',
      state,
      response_type: 'code',
    })

    window.location.href = `https://www.figma.com/oauth?${params.toString()}`
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

        {(klaviyoConnections.length > 0 || figmaConnection) && (
          <Button
            variant="outline"
            onClick={refreshConnectionStatuses}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Checking...' : 'Check status'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="klaviyo" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="klaviyo">
            Klaviyo ({klaviyoConnections.length + teamConnections.length})
          </TabsTrigger>
          <TabsTrigger value="figma">
            Figma ({figmaConnection ? 1 : 0})
          </TabsTrigger>
        </TabsList>

        {/* Klaviyo tab content */}
        <TabsContent value="klaviyo" className="space-y-6">
          {/* Connection limit indicator */}
          {connectionLimit > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Klaviyo accounts: <span className="font-medium text-foreground">{connectionCount} / {connectionLimit}</span>
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

          {/* User's own connections */}
          {klaviyoConnections.length > 0 && (
            <div className="space-y-6">
              {teamConnections.length > 0 && (
                <h3 className="text-sm font-medium text-muted-foreground">Your connections</h3>
              )}
              {klaviyoConnections.map((conn) => (
                <Card key={conn.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium">{conn.account_name || 'Unnamed account'}</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(conn.created_at).toLocaleDateString('en-GB')}
                          </p>
                        </div>
                        {getStatusBadge(conn.id)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => confirmDelete('klaviyo', conn.id, conn.account_name || 'Unnamed account')}
                        disabled={deletingId === conn.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {deletingId === conn.id ? 'Removing...' : 'Remove'}
                      </Button>
                    </div>
                    {/* Footer status */}
                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {conn.hasFooter ? (
                          <>
                            <span className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="text-sm text-muted-foreground">Footer configured</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
                            <span className="text-sm text-muted-foreground">No footer set up</span>
                          </>
                        )}
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setFooterSetupConnection(conn)}
                        className="h-auto p-0"
                      >
                        {conn.hasFooter ? 'Update footer' : 'Setup footer'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Team shared connections (read-only) */}
          {teamConnections.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-sm font-medium text-muted-foreground mt-6">Team connections</h3>
              {teamConnections.map((conn) => (
                <Card key={conn.id} className="border-dashed">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{conn.account_name || 'Unnamed account'}</p>
                            <Badge variant="secondary" className="text-xs">Shared</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Shared by {conn.owner_name || 'Team Admin'}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Footer status (read-only) */}
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2">
                        {conn.hasFooter ? (
                          <>
                            <span className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="text-sm text-muted-foreground">Footer configured</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
                            <span className="text-sm text-muted-foreground">No footer set up</span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {showAddForm ? (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="account-name">Account name</Label>
                  <Input
                    id="account-name"
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g., Client A, My Store"
                  />
                  <p className="text-xs text-muted-foreground">
                    Give this connection a name so you can identify it later
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={startKlaviyoOAuth}
                    disabled={!accountName.trim()}
                  >
                    Connect to Klaviyo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddForm(false)
                      setAccountName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : canAddConnection ? (
            <Button onClick={() => setShowAddForm(true)}>
              Add Klaviyo account
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowUpgradePrompt(true)}
              disabled={currentTier === 'pro'}
            >
              {currentTier === 'pro' ? 'Maximum accounts reached' : 'Upgrade to add more accounts'}
            </Button>
          )}
        </TabsContent>

        {/* Figma tab content */}
        <TabsContent value="figma" className="space-y-6">
          {figmaConnection ? (
            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{figmaConnection.figma_email || 'Figma account'}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(figmaConnection.created_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  {getStatusBadge(figmaConnection.id)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => confirmDelete('figma', figmaConnection.id, figmaConnection.figma_email || 'Figma account')}
                  disabled={deletingId === figmaConnection.id}
                  className="text-destructive hover:text-destructive"
                >
                  {deletingId === figmaConnection.id ? 'Removing...' : 'Remove'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Figma account to import designs.
              </p>
              <Button onClick={startFigmaOAuth}>
                Connect Figma
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer Setup Modal */}
      {footerSetupConnection && (
        <FooterSetup
          connectionId={footerSetupConnection.id}
          hasFooter={footerSetupConnection.hasFooter}
          onComplete={() => {
            setFooterSetupConnection(null)
            router.refresh()
          }}
          onCancel={() => setFooterSetupConnection(null)}
        />
      )}

      {/* Delete confirmation modal */}
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

      {/* Upgrade prompt modal */}
      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        currentTier={currentTier as SubscriptionTier | null}
        currentLimit={connectionLimit}
        currentCount={connectionCount}
      />
    </div>
  )
}

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(Array.from(buffer).map(b => String.fromCharCode(b)).join(''))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
