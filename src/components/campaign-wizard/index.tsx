'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { WizardProgress } from './wizard-progress'
import { Step1Import } from './step-1-import'
import { EmailSlicer, type SliceDefinition } from './email-slicer'
import { Step3Settings } from './step-3-settings'
import { Step4Export } from './step-4-export'
import { CampaignLeaveGuard } from './leave-campaign-guard'
import { Campaign, KlaviyoAudience } from '@/types/database'
import { ExportSettings } from '@/lib/campaign-export'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  consumeProcessFigmaStream,
  ProcessFigmaStreamError,
} from '@/lib/process-figma-stream-client'

interface KlaviyoConnection {
  id: string
  account_name: string | null
  store_url?: string | null
  owner_name?: string
}

interface Frame {
  id: string
  figma_node_id: string
  name: string
  width: number | null
  image_url: string | null
  klaviyo_image_url?: string | null
  link_url: string | null
  display_order: number
}

function parseSliceLayout(raw: unknown): SliceDefinition[] | null {
  if (!raw || !Array.isArray(raw)) return null
  return raw as SliceDefinition[]
}

interface CampaignWizardProps {
  campaign: Campaign & {
    klaviyo_connections?: { account_name: string | null; store_url?: string | null } | null
    projects?: {
      frames?: Frame[]
      slice_master_image_url?: string | null
      slice_layout_json?: unknown
    } | null
  }
  klaviyoConnections: KlaviyoConnection[]
  teamConnections?: KlaviyoConnection[]
  hasFigmaConnection: boolean
  campaignName: string
  /** Opened via ?reimport=1 after “Replace design” on a scheduled / Klaviyo draft campaign */
  initialReimportFocus?: boolean
  /** Opened via ?reslice=1 after “Edit slices & links”—refreshes frame from Figma before the slicer */
  initialResliceFromFigma?: boolean
}

function getInitialWizardStep(
  c: Campaign & { projects?: { frames?: Frame[] } | null },
): number {
  if (!c.project_id) return 1
  return Math.max(2, c.wizard_step || 2)
}

const STEPS = [
  { label: 'Edit', description: 'Add links' },
  { label: 'Send', description: 'Configure & send' },
]

export function CampaignWizard({
  campaign: initialCampaign,
  klaviyoConnections,
  teamConnections = [],
  hasFigmaConnection,
  campaignName,
  initialReimportFocus = false,
  initialResliceFromFigma = false,
}: CampaignWizardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [step, setStep] = useState(() => getInitialWizardStep(initialCampaign))
  const [frames, setFrames] = useState<Frame[]>(initialCampaign.projects?.frames || [])
  // Track connectionId separately to handle reconnection scenarios
  const [connectionId, setConnectionId] = useState(initialCampaign.klaviyo_connection_id || '')
  const [conceptUpdates, setConceptUpdates] = useState<Record<string, unknown> | null>(null)
  const [exportParams, setExportParams] = useState<{ settings: ExportSettings; asDraft: boolean } | null>(null)
  const [klaviyoHybridDndSlot, setKlaviyoHybridDndSlot] = useState(
    initialCampaign.klaviyo_hybrid_dnd_slot ?? false,
  )
  const [showReimport, setShowReimport] = useState(
    initialReimportFocus && !!initialCampaign.project_id,
  )
  const [showResliceRefresh, setShowResliceRefresh] = useState(
    initialResliceFromFigma && !!initialCampaign.project_id,
  )
  const [reimportBusy, setReimportBusy] = useState(false)
  const [resliceBusy, setResliceBusy] = useState(false)
  const [resliceProgress, setResliceProgress] = useState<string | null>(null)
  const [resliceError, setResliceError] = useState<string | null>(null)
  const reimportFetchAbortRef = useRef<AbortController | null>(null)
  const resliceFetchAbortRef = useRef<AbortController | null>(null)
  const wasResumed =
    !!initialCampaign.project_id && (initialCampaign.wizard_step || 1) >= 2

  const clearReimportQuery = useCallback(() => {
    router.replace(pathname)
  }, [router, pathname])

  useEffect(() => {
    setKlaviyoHybridDndSlot(initialCampaign.klaviyo_hybrid_dnd_slot ?? false)
  }, [initialCampaign.id, initialCampaign.klaviyo_hybrid_dnd_slot])

  // Update wizard step in database when it changes (skip step 4 — export is transient)
  useEffect(() => {
    if (step !== campaign.wizard_step && step <= 3) {
      fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wizard_step: step }),
      })
    }
  }, [step, campaign.id, campaign.wizard_step])

  const pullCampaignAndEnterSliceStep = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${campaign.id}`)
    if (response.ok) {
      const { campaign: updatedCampaign } = await response.json()
      setCampaign(updatedCampaign)
      setFrames(updatedCampaign.projects?.frames || [])
      setKlaviyoHybridDndSlot(updatedCampaign.klaviyo_hybrid_dnd_slot ?? false)
    }
    setStep(2)
    clearReimportQuery()
  }, [campaign.id, clearReimportQuery])

  const handleStep1Complete = async (data: { connectionId: string; figmaUrl: string }) => {
    setConnectionId(data.connectionId)
    setShowReimport(false)

    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klaviyo_connection_id: data.connectionId, slice_mode: true }),
    })

    await pullCampaignAndEnterSliceStep()
  }

  useEffect(() => {
    if (!showResliceRefresh) return
    const figmaUrl = campaign.figma_url?.trim()
    if (!figmaUrl) return

    const ac = new AbortController()
    resliceFetchAbortRef.current = ac
    let cancelled = false

    ;(async () => {
      setResliceBusy(true)
      setResliceError(null)
      setResliceProgress('Refreshing from Figma…')
      try {
        const response = await fetch(`/api/campaigns/${campaign.id}/process-figma`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figmaUrl, forceRefresh: true }),
          signal: ac.signal,
        })

        await consumeProcessFigmaStream(response, (msg) => setResliceProgress(msg ?? null))
        if (cancelled) return

        await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slice_mode: true }),
        })

        await pullCampaignAndEnterSliceStep()
        setShowResliceRefresh(false)
        setResliceProgress(null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Something went wrong'
        const already = err instanceof ProcessFigmaStreamError ? err.toastAlreadyShown : false
        if (!already) toast.error(message)
        setResliceError(message)
        setResliceProgress(null)
      } finally {
        if (!cancelled) setResliceBusy(false)
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [showResliceRefresh, campaign.figma_url, campaign.id, pullCampaignAndEnterSliceStep])

  const persistHybridSlot = async () => {
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klaviyo_hybrid_dnd_slot: klaviyoHybridDndSlot }),
    })
    setCampaign((c) => ({ ...c, klaviyo_hybrid_dnd_slot: klaviyoHybridDndSlot }))
  }

  /** Step 2: slicer + links; finalize writes frames + layout */
  const handleStep2Complete = async (updatedFrames: Frame[]) => {
    setFrames(updatedFrames)
    await persistHybridSlot()
    const res = await fetch(`/api/campaigns/${campaign.id}`)
    if (res.ok) {
      const { campaign: updated } = await res.json()
      setCampaign(updated)
      setFrames(updated.projects?.frames || updatedFrames)
      setKlaviyoHybridDndSlot(updated.klaviyo_hybrid_dnd_slot ?? false)
    }
    setStep(3)
  }

  const handleStep3Complete = (params: { settings: ExportSettings; asDraft: boolean }) => {
    setExportParams(params)
    setStep(4)
  }

  const handleExportComplete = () => {
    router.push('/campaigns')
  }

  const handleExportError = () => {
    setStep(3)
    setExportParams(null)
  }

  const goBack = async () => {
    if (step !== 3) return
    if (conceptUpdates) {
      await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conceptUpdates),
      })
      const res = await fetch(`/api/campaigns/${campaign.id}`)
      if (res.ok) {
        const { campaign: updated } = await res.json()
        setCampaign(updated)
        setKlaviyoHybridDndSlot(updated.klaviyo_hybrid_dnd_slot ?? false)
      }
    }
    setStep(2)
  }

  // Get the selected Klaviyo account name (check both own and team connections)
  const allConnections = [...klaviyoConnections, ...teamConnections]
  const selectedAccount = allConnections.find(conn => conn.id === connectionId)

  return (
    <div
      className={
        step === 2
          ? 'flex-1 flex flex-col min-h-0 max-h-[calc(100vh-var(--header-height,0px)-6.5rem)]'
          : 'flex-1 flex flex-col min-h-0'
      }
    >
      <CampaignLeaveGuard
        campaignId={campaign.id}
        step={step}
        isActive={step !== 4 && (campaign.status === 'in_progress' || (campaign.status as string) === 'concept')}
        campaignStatus={campaign.status}
        hasKlaviyoExport={Boolean(campaign.klaviyo_campaign_id || campaign.klaviyo_template_id)}
        getConceptUpdates={() => conceptUpdates}
        wasResumed={wasResumed}
      />
      {step !== 4 && (
        <>
          <div className="flex items-center justify-between mb-8 flex-shrink-0">
            <h1 className="text-2xl font-bold">{campaignName}</h1>
            {step >= 2 && selectedAccount && (
              <span className="text-sm text-muted-foreground">
                {selectedAccount.account_name || 'Unnamed account'}
              </span>
            )}
          </div>

          {step >= 2 && step <= 3 && (
            <div className="flex-shrink-0">
              <WizardProgress currentStep={step - 1} steps={STEPS} />
            </div>
          )}
        </>
      )}

      <div
        className={
          step === 2
            ? 'mt-8 flex-1 flex flex-col min-h-0 overflow-y-auto'
            : 'mt-8'
        }
      >
        {step === 1 && (
          <div className="max-w-xl mx-auto space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste your Figma frame URL to import slices for this draft.
            </p>
            <Step1Import
              klaviyoConnections={klaviyoConnections}
              teamConnections={teamConnections}
              hasFigmaConnection={hasFigmaConnection}
              campaignId={campaign.id}
              initialConnectionId={connectionId}
              initialFigmaUrl={campaign.figma_url || ''}
              onComplete={handleStep1Complete}
            />
          </div>
        )}

        {step === 2 && (
          <>
            <Dialog
              open={showResliceRefresh && !!campaign.project_id}
              onOpenChange={(open) => {
                if (open) return
                resliceFetchAbortRef.current?.abort()
                resliceFetchAbortRef.current = null
                setShowResliceRefresh(false)
                setResliceError(null)
                setResliceProgress(null)
                clearReimportQuery()
              }}
            >
              <DialogContent
                className="max-w-lg"
                onPointerDownOutside={(e) => {
                  if (resliceBusy) e.preventDefault()
                }}
                onEscapeKeyDown={(e) => {
                  if (resliceBusy) e.preventDefault()
                }}
              >
                <DialogHeader>
                  <DialogTitle>Refreshing from Figma</DialogTitle>
                  <DialogDescription>
                    We are pulling your saved frame again so slices and bucket images match the file.
                    This can take a bit longer; the dialog closes when the slice editor is ready.
                  </DialogDescription>
                </DialogHeader>
                {!campaign.figma_url?.trim() ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      No Figma URL is stored on this campaign. Use Replace design from the edit menu
                      and paste a frame link first.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowResliceRefresh(false)
                        clearReimportQuery()
                      }}
                    >
                      Close
                    </Button>
                  </div>
                ) : resliceError ? (
                  <div className="space-y-4">
                    <p className="text-sm text-destructive">{resliceError}</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowResliceRefresh(false)
                        setResliceError(null)
                        clearReimportQuery()
                      }}
                    >
                      Close
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    {resliceProgress ?? 'Starting…'}
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Dialog
              open={showReimport && !!campaign.project_id}
              onOpenChange={(open) => {
                if (open) return
                reimportFetchAbortRef.current?.abort()
                reimportFetchAbortRef.current = null
                setShowReimport(false)
                clearReimportQuery()
              }}
            >
              <DialogContent
                className="max-w-[min(48rem,calc(100vw-2rem))]"
                onPointerDownOutside={(e) => {
                  if (reimportBusy) e.preventDefault()
                }}
                onEscapeKeyDown={(e) => {
                  if (reimportBusy) e.preventDefault()
                }}
              >
                <DialogHeader>
                  <DialogTitle>Replace design from Figma</DialogTitle>
                  <DialogDescription>
                    Paste a new frame URL—the same layout as starting a campaign from the campaigns
                    page. Your Klaviyo account and send settings stay as they are. This dialog stays
                    open until import finishes and you are back on the slice step.
                  </DialogDescription>
                </DialogHeader>
                <Step1Import
                  layout="inline"
                  lockKlaviyoAccount
                  lockedAccountLabel={
                    selectedAccount?.account_name || selectedAccount?.store_url || undefined
                  }
                  submitLabel="Create campaign"
                  klaviyoConnections={klaviyoConnections}
                  teamConnections={teamConnections}
                  hasFigmaConnection={hasFigmaConnection}
                  campaignId={campaign.id}
                  initialConnectionId={connectionId}
                  initialFigmaUrl={campaign.figma_url || ''}
                  onComplete={handleStep1Complete}
                  abortControllerRef={reimportFetchAbortRef}
                  onBusyChange={setReimportBusy}
                  forceRefresh
                />
              </DialogContent>
            </Dialog>
            <EmailSlicer
              campaignId={campaign.id}
              projectId={campaign.project_id!}
              frames={frames}
              sliceMasterImageUrl={campaign.projects?.slice_master_image_url ?? null}
              initialSliceLayout={parseSliceLayout(campaign.projects?.slice_layout_json)}
              klaviyoHybridDndSlot={klaviyoHybridDndSlot}
              onKlaviyoHybridDndSlotChange={setKlaviyoHybridDndSlot}
              onComplete={handleStep2Complete}
            />
          </>
        )}


        {step === 3 && connectionId && (
          <Step3Settings
            campaignId={campaign.id}
            connectionId={connectionId}
            frames={frames}
            initialName={campaign.name}
            initialSubjectLine={campaign.subject_line || ''}
            initialPreviewText={campaign.preview_text || ''}
            initialIncludedAudiences={campaign.included_audiences as KlaviyoAudience[] || []}
            initialExcludedAudiences={campaign.excluded_audiences as KlaviyoAudience[] || []}
            initialScheduledAt={campaign.scheduled_at || null}
            initialUseRecipientTimezone={campaign.send_in_recipient_timezone || false}
            initialUtmSettings={campaign.utm_settings}
            isUpdate={!!(campaign.klaviyo_template_id && campaign.klaviyo_campaign_id)}
            onConceptDraftChange={setConceptUpdates}
            onComplete={handleStep3Complete}
            onBack={goBack}
          />
        )}

        {step === 3 && !connectionId && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">Klaviyo connection needed</h3>
            <p className="text-muted-foreground mb-4">
              Your Klaviyo connection has expired. Reconnect Klaviyo, then open this campaign again.
            </p>
            <Button asChild>
              <Link href="/connections">Go to Connections</Link>
            </Button>
          </div>
        )}

        {step === 4 && exportParams && (
          <Step4Export
            campaignId={campaign.id}
            settings={exportParams.settings}
            asDraft={exportParams.asDraft}
            isUpdate={!!(campaign.klaviyo_template_id && campaign.klaviyo_campaign_id)}
            onComplete={handleExportComplete}
            onError={handleExportError}
          />
        )}
      </div>
    </div>
  )
}
