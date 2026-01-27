'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FooterSetup } from './footer-setup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, Loader2 } from 'lucide-react'

interface KlaviyoConnection {
  id: string
  account_name: string | null
  klaviyo_account_id: string | null
  hasFooter: boolean
  created_at: string
}

interface FigmaConnection {
  id: string
  figma_email: string | null
  created_at: string
}

interface ConnectionsTabsProps {
  klaviyoConnections: KlaviyoConnection[]
  figmaConnection: FigmaConnection | null
}

type ConnectionStatus = 'active' | 'expired' | 'error' | 'checking' | 'unknown'

export function ConnectionsTabs({ klaviyoConnections, figmaConnection }: ConnectionsTabsProps) {
  const [accountName, setAccountName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [footerSetupConnection, setFooterSetupConnection] = useState<KlaviyoConnection | null>(null)
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()

  const refreshConnectionStatuses = async () => {
    setIsRefreshing(true)

    const checkingStatuses: Record<string, ConnectionStatus> = {}
    klaviyoConnections.forEach(conn => {
      checkingStatuses[conn.id] = 'checking'
    })
    setConnectionStatuses(checkingStatuses)

    try {
      const response = await fetch('/api/connections/klaviyo/status')
      if (response.ok) {
        const { statuses } = await response.json()
        const newStatuses: Record<string, ConnectionStatus> = {}
        statuses.forEach((s: { id: string; status: ConnectionStatus }) => {
          newStatuses[s.id] = s.status
        })
        setConnectionStatuses(newStatuses)
      }
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

  const deleteConnection = async (type: 'klaviyo' | 'figma', id: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) return

    setDeletingId(id)

    try {
      const response = await fetch(`/api/connections/${type}/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

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

        {klaviyoConnections.length > 0 && (
          <Button
            variant="outline"
            onClick={refreshConnectionStatuses}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Checking...' : 'Check status'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="klaviyo" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="klaviyo">
            Klaviyo ({klaviyoConnections.length})
          </TabsTrigger>
          <TabsTrigger value="figma">
            Figma ({figmaConnection ? 1 : 0})
          </TabsTrigger>
        </TabsList>

        {/* Klaviyo tab content */}
        <TabsContent value="klaviyo" className="space-y-4">
          {klaviyoConnections.length > 0 && (
            <Card>
              <CardContent className="p-0 divide-y">
                {klaviyoConnections.map((conn) => (
                  <div key={conn.id} className="p-4">
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
                        onClick={() => deleteConnection('klaviyo', conn.id)}
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
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {showAddForm ? (
            <Card>
              <CardContent className="p-4 space-y-4">
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
          ) : (
            <Button onClick={() => setShowAddForm(true)}>
              Add Klaviyo account
            </Button>
          )}
        </TabsContent>

        {/* Figma tab content */}
        <TabsContent value="figma" className="space-y-4">
          {figmaConnection ? (
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{figmaConnection.figma_email || 'Figma account'}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(figmaConnection.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteConnection('figma', figmaConnection.id)}
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
