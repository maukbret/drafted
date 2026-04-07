'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startKlaviyoOAuth } from '@/lib/oauth'
import { useSearchParams } from 'next/navigation'
import { FooterSetupInline } from '@/components/footer-setup-inline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, CheckCircle2 } from 'lucide-react'

interface KlaviyoConnectStepProps {
  onComplete: () => void
  onSkip: () => void
  initialSuccess?: boolean
  newConnectionId?: string | null
  isPreview?: boolean
}

export function KlaviyoConnectStep({
  onComplete,
  onSkip,
  initialSuccess = false,
  newConnectionId = null,
  isPreview = false,
}: KlaviyoConnectStepProps) {
  const [loading, setLoading] = useState(!isPreview)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionId, setConnectionId] = useState<string | null>(newConnectionId)
  const [hasFooter, setHasFooter] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [storeUrl, setStoreUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [footerDone, setFooterDone] = useState(false)
  const supabase = createClient()
  const searchParams = useSearchParams()
  const oauthError = searchParams.get('error') === 'klaviyo_account_lookup_failed'
    ? 'Connection failed. Add your organization country in Klaviyo Settings and try reconnecting.'
    : null
  const displayFormError = formError ?? oauthError

  useEffect(() => {
    if (isPreview) return

    const checkConnection = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Check for existing Klaviyo connection
      const { data: connections } = await supabase
        .from('klaviyo_connections')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)

      if (connections && connections.length > 0) {
        setIsConnected(true)
        setConnectionId(connections[0].id)

        // Check if footer exists
        const { data: footer } = await supabase
          .from('klaviyo_footers')
          .select('id')
          .eq('klaviyo_connection_id', connections[0].id)
          .maybeSingle()

        setHasFooter(!!footer)
      }

      if (initialSuccess && newConnectionId) {
        setIsConnected(true)
        setConnectionId(newConnectionId)
      }

      setLoading(false)
    }

    checkConnection()
  }, [supabase, initialSuccess, newConnectionId, isPreview])

  useEffect(() => {
    if (!oauthError) return

    toast.error('Klaviyo connection failed', {
      description: 'Mauk.ai could not read your Klaviyo account details. Adding your organization country in Klaviyo Settings can fix this.',
    })

    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState({}, '', url.toString())
  }, [oauthError])

  const handleConnect = () => {
    if (isPreview) {
      toast.message('Preview mode', {
        description: 'OAuth is disabled on this static preview page.',
      })
      return
    }
    const error = startKlaviyoOAuth(accountName, storeUrl)
    if (error) {
      setFormError(error)
    } else {
      setFormError(null)
    }
  }

  const handleFooterComplete = () => {
    setFooterDone(true)
    setHasFooter(true)
  }

  const finishOnboarding = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        onboarding_step: 5,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    onComplete()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Phase B: Connected - show footer setup or completion
  if (isConnected && connectionId) {
    // Footer already done or just completed
    if (hasFooter || footerDone) {
      return (
        <div className="space-y-6">
          <div className="text-left space-y-1">
            <h1 className="text-2xl font-bold">Connect your Klaviyo account</h1>
            <p className="text-muted-foreground">
              Export your designs as Klaviyo email campaigns
            </p>
          </div>

          <div className="flex items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-medium">Klaviyo connected</p>
              {hasFooter && (
                <p className="text-sm text-muted-foreground mt-1">Footer configured</p>
              )}
            </div>
          </div>

          <Button onClick={finishOnboarding} className="w-full">
            Complete setup
          </Button>
        </div>
      )
    }

    // Show inline footer setup
    return (
      <div className="space-y-6">
        <div className="text-left space-y-1">
          <h1 className="text-2xl font-bold">Connect your Klaviyo account</h1>
          <p className="text-muted-foreground">
            Export your designs as Klaviyo email campaigns
          </p>
        </div>

        <div className="flex items-center gap-2 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-sm font-medium">Klaviyo connected</p>
        </div>

        <div className="border-t pt-4">
          <FooterSetupInline
            connectionId={connectionId}
            hasFooter={hasFooter}
            onComplete={handleFooterComplete}
            onSkip={finishOnboarding}
          />
        </div>
      </div>
    )
  }

  // Phase A: Not connected - show form
  return (
    <div className="space-y-6">
      <div className="text-left space-y-1">
        <h1 className="text-2xl font-bold">Connect your Klaviyo account</h1>
        <p className="text-muted-foreground">
          Export your designs as Klaviyo email campaigns
        </p>
      </div>

      <div className="space-y-4">
        

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="klaviyo-account-name">Account name</Label>
            <Input
              id="klaviyo-account-name"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. My Brand"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="klaviyo-store-url">Store URL</Label>
            <Input
              id="klaviyo-store-url"
              type="text"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="e.g. https://yourstore.com"
            />
          </div>
        </div>

        {displayFormError && (
          <p className="text-sm text-destructive">{displayFormError}</p>
        )}
      </div>

      <div className="space-y-3">
        <Button onClick={handleConnect} className="w-full">
          Connect to Klaviyo
        </Button>
        <button
          type="button"
          onClick={async () => {
            if (isPreview) {
              toast.message('Preview mode', {
                description: 'Skip is disabled on this static preview page.',
              })
              return
            }
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await supabase
                .from('profiles')
                .update({
                  onboarding_completed: true,
                  onboarding_step: 5,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', user.id)
            }
            onSkip()
          }}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
