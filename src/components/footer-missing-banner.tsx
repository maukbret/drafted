'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FooterSetup } from './footer-setup'
import { X, AlertTriangle } from 'lucide-react'

interface ConnectionWithoutFooter {
  id: string
  account_name: string | null
  klaviyo_account_id: string | null
  isOwn: boolean
}

export function FooterMissingBanner() {
  const [connections, setConnections] = useState<ConnectionWithoutFooter[]>([])
  const [isTeamAdmin, setIsTeamAdmin] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [footerSetupConnectionId, setFooterSetupConnectionId] = useState<string | null>(null)
  const router = useRouter()

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/connections/klaviyo/footer-status')
      if (response.ok) {
        const data = await response.json()
        setConnections(data.connectionsWithoutFooter || [])
        setIsTeamAdmin(data.isTeamAdmin || false)
      }
    } catch (err) {
      console.error('Failed to fetch footer status:', err)
    }
  }

  useEffect(() => {
    fetchStatus()

    const handleFooterSetup = () => fetchStatus()
    window.addEventListener('footer-setup-complete', handleFooterSetup)
    return () => window.removeEventListener('footer-setup-complete', handleFooterSetup)
  }, [])

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id))
  }

  const visibleConnections = connections.filter(c => !dismissedIds.has(c.id))

  if (visibleConnections.length === 0) return null

  return (
    <>
      <div className="space-y-3 px-8 pt-4">
        {visibleConnections.map((conn) => {
          const canSetup = conn.isOwn || isTeamAdmin

          return (
            <Card key={conn.id} className="border-amber-500/20 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none text-amber-800 dark:text-amber-200">
                        {conn.account_name || 'Klaviyo account'} doesn&apos;t have a footer configured
                      </p>
                      {!canSetup && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                          Contact your team admin to configure the footer.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canSetup && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-500/30 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/30"
                        onClick={() => setFooterSetupConnectionId(conn.id)}
                      >
                        Set up footer
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900/30"
                      onClick={() => handleDismiss(conn.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Footer Setup Modal triggered from banner */}
      {footerSetupConnectionId && (
        <FooterSetup
          connectionId={footerSetupConnectionId}
          hasFooter={false}
          onComplete={() => {
            setFooterSetupConnectionId(null)
            fetchStatus()
            router.refresh()
          }}
          onCancel={() => setFooterSetupConnectionId(null)}
        />
      )}
    </>
  )
}
