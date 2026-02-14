'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startFigmaOAuth } from '@/lib/oauth'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2 } from 'lucide-react'

interface FigmaConnectStepProps {
  onComplete: () => void
  onSkip: () => void
  initialSuccess?: boolean
}

export function FigmaConnectStep({ onComplete, onSkip, initialSuccess = false }: FigmaConnectStepProps) {
  const [loading, setLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const checkConnection = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: figmaConnection } = await supabase
        .from('figma_connections')
        .select('figma_email')
        .eq('user_id', user.id)
        .maybeSingle()

      if (figmaConnection) {
        setIsConnected(true)
        setConnectedEmail(figmaConnection.figma_email)
      }

      setLoading(false)
    }

    checkConnection()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isConnected || initialSuccess) {
    return (
      <div className="space-y-6">
        <div className="text-left space-y-1">
          <h1 className="text-2xl font-semibold">Connect your Figma account</h1>
          <p className="text-muted-foreground">
            Connect the account you use to create or view the designs
          </p>
        </div>

        <div className="flex items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <p className="font-medium">Figma connected</p>
            {connectedEmail && (
              <p className="text-sm text-muted-foreground mt-1">{connectedEmail}</p>
            )}
          </div>
        </div>

        <Button onClick={onComplete} className="w-full">
          Continue
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-left space-y-1">
        <h1 className="text-2xl font-bold">Connect your Figma account</h1>
        <p className="text-muted-foreground">
          Connect the account you use to create or view the designs
        </p>
      </div>

      <div className="space-y-3">
        <Button onClick={startFigmaOAuth} className="w-full">
          Connect Figma
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
