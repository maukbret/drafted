'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
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
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PendingNavigation =
  | { kind: 'href'; href: string; external: boolean }
  | { kind: 'back' }

interface CampaignLeaveGuardProps {
  /** Campaign id used for save/discard actions. */
  campaignId: string
  /** Current wizard step for determining guard behavior. */
  step: number
  /** Whether the campaign is still in creation mode. */
  isActive: boolean
  /** Campaign status — used to determine if auto-save should happen instead of discard prompt. */
  campaignStatus: string
  /** Optional callback to fetch unsaved step data for concept save. */
  getConceptUpdates?: () => Record<string, unknown> | null
  /** Whether the campaign was resumed from a previously saved state (wizard_step >= 2 at load). */
  wasResumed?: boolean
}

export function CampaignLeaveGuard({
  campaignId,
  step,
  isActive,
  campaignStatus,
  getConceptUpdates,
  wasResumed = false,
}: CampaignLeaveGuardProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = React.useState(false)
  const [isWorking, setIsWorking] = React.useState(false)
  const pendingRef = React.useRef<PendingNavigation | null>(null)
  const bypassRef = React.useRef(false)
  const skipPopRef = React.useRef(false)

  // Campaigns already pushed to Klaviyo should auto-save edits, never show discard option
  const isExported = campaignStatus === 'klaviyo_draft' || campaignStatus === 'scheduled' || campaignStatus === 'sent' || campaignStatus === 'cancelled'

  const shouldAutoDelete = isActive && step === 1
  const shouldAutoSave = (isExported && step >= 2) || (wasResumed && step >= 2)
  const shouldPrompt = isActive && step >= 2 && !isExported && !wasResumed

  const navigate = React.useCallback(
    (pending: PendingNavigation) => {
      bypassRef.current = true
      if (pending.kind === 'back') {
        router.back()
      } else if (pending.external) {
        window.location.href = pending.href
      } else {
        router.push(pending.href)
      }
      window.setTimeout(() => {
        bypassRef.current = false
      }, 0)
    },
    [router]
  )

  const discardCampaign = React.useCallback(async () => {
    await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' })
  }, [campaignId])

  const saveAsConcept = React.useCallback(async () => {
    const conceptUpdates = getConceptUpdates?.() || {}
    const payload: Record<string, unknown> = { wizard_step: step, ...conceptUpdates }
    // Only set status to in_progress for new campaigns, preserve status for exported ones
    if (!isExported) {
      payload.status = 'in_progress'
    }
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }, [campaignId, getConceptUpdates, isExported, step])

  const handleAttemptLeave = React.useCallback(
    async (pending: PendingNavigation) => {
      if (bypassRef.current) {
        navigate(pending)
        return
      }

      // Exported campaigns: silently save edits and navigate
      if (shouldAutoSave) {
        setIsWorking(true)
        try {
          await saveAsConcept()
        } finally {
          setIsWorking(false)
        }
        navigate(pending)
        return
      }

      if (!isActive) {
        navigate(pending)
        return
      }

      if (shouldAutoDelete) {
        setIsWorking(true)
        try {
          await discardCampaign()
        } finally {
          setIsWorking(false)
        }
        navigate(pending)
        return
      }

      if (shouldPrompt) {
        pendingRef.current = pending
        setIsOpen(true)
        return
      }

      navigate(pending)
    },
    [discardCampaign, isActive, navigate, saveAsConcept, shouldAutoDelete, shouldAutoSave, shouldPrompt]
  )

  // Guard is active for in-progress campaigns AND exported campaigns being edited
  const guardActive = isActive || isExported

  React.useEffect(() => {
    if (!guardActive) return

    const handleDocumentClick = (event: MouseEvent) => {
      if (bypassRef.current) return
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return

      const url = new URL(href, window.location.href)
      const isExternal = url.origin !== window.location.origin
      const normalizedHref = isExternal
        ? url.toString()
        : `${url.pathname}${url.search}${url.hash}`

      if (!isExternal && normalizedHref === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        return
      }

      event.preventDefault()
      handleAttemptLeave({ kind: 'href', href: normalizedHref, external: isExternal })
    }

    const handlePopState = () => {
      if (skipPopRef.current) {
        skipPopRef.current = false
        return
      }
      if (bypassRef.current) return

      if (shouldAutoSave || shouldAutoDelete || shouldPrompt) {
        skipPopRef.current = true
        window.history.forward()
        handleAttemptLeave({ kind: 'back' })
      }
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (shouldPrompt) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    const handlePageHide = () => {
      if (shouldAutoDelete) {
        fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE', keepalive: true })
      } else if (shouldAutoSave) {
        const conceptUpdates = getConceptUpdates?.() || {}
        fetch(`/api/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wizard_step: step, ...conceptUpdates }),
          keepalive: true,
        })
      }
    }

    document.addEventListener('click', handleDocumentClick, true)
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [campaignId, getConceptUpdates, guardActive, handleAttemptLeave, shouldAutoDelete, shouldAutoSave, shouldPrompt, step])

  const handleSave = async () => {
    if (!pendingRef.current) return
    setIsWorking(true)
    try {
      await saveAsConcept()
    } finally {
      setIsWorking(false)
    }
    const pending = pendingRef.current
    pendingRef.current = null
    setIsOpen(false)
    navigate(pending)
  }

  const handleDiscard = async () => {
    if (!pendingRef.current) return
    setIsWorking(true)
    try {
      await discardCampaign()
    } finally {
      setIsWorking(false)
    }
    const pending = pendingRef.current
    pendingRef.current = null
    setIsOpen(false)
    navigate(pending)
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !isWorking && setIsOpen(open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save as concept?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ve already imported your Figma frames. Save this campaign as a concept so you can
            continue later, or discard it to remove everything.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between">
          <AlertDialogCancel
            disabled={isWorking}
            className={cn(
              buttonVariants({ variant: 'link' }),
              "h-auto p-0 text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            Keep editing
          </AlertDialogCancel>
          <div className="flex gap-2">
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleDiscard()
              }}
              className={cn(buttonVariants({ variant: 'destructive' }),
                "red-button")}
              disabled={isWorking}
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleSave()
              }}
              disabled={isWorking}
            >
              Save as concept
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
