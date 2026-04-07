'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WizardProgress } from './wizard-progress'
import { Step1Import } from './step-1-import'
import { EmailSlicer, type SliceDefinition } from './email-slicer'
import { Step3Settings } from './step-3-settings'
import { Step4Export } from './step-4-export'
import { CampaignLeaveGuard } from './leave-campaign-guard'
import { Campaign, KlaviyoAudience } from '@/types/database'
import { ExportSettings } from '@/lib/campaign-export'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

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
}

const STEPS = [
  { label: 'Import', description: 'Select Figma design' },
  { label: 'Edit', description: 'Add links' },
  { label: 'Send', description: 'Configure & send' },
]

export function CampaignWizard({
  campaign: initialCampaign,
  klaviyoConnections,
  teamConnections = [],
  hasFigmaConnection,
  campaignName,
}: CampaignWizardProps) {
  const router = useRouter()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [step, setStep] = useState(initialCampaign.wizard_step || 1)
  const [frames, setFrames] = useState<Frame[]>(initialCampaign.projects?.frames || [])
  // Track connectionId separately to handle reconnection scenarios
  const [connectionId, setConnectionId] = useState(initialCampaign.klaviyo_connection_id || '')
  const [conceptUpdates, setConceptUpdates] = useState<Record<string, unknown> | null>(null)
  const [exportParams, setExportParams] = useState<{ settings: ExportSettings; asDraft: boolean } | null>(null)
  const [klaviyoHybridDndSlot, setKlaviyoHybridDndSlot] = useState(
    initialCampaign.klaviyo_hybrid_dnd_slot ?? false,
  )
  const wasResumed = (initialCampaign.wizard_step || 1) >= 2

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

  const handleStep1Complete = async (data: { connectionId: string; figmaUrl: string }) => {
    setConnectionId(data.connectionId)

    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klaviyo_connection_id: data.connectionId, slice_mode: true }),
    })

    // Fetch updated campaign with frames
    const response = await fetch(`/api/campaigns/${campaign.id}`)
    if (response.ok) {
      const { campaign: updatedCampaign } = await response.json()
      setCampaign(updatedCampaign)
      setFrames(updatedCampaign.projects?.frames || [])
      setKlaviyoHybridDndSlot(updatedCampaign.klaviyo_hybrid_dnd_slot ?? false)
    }
    setStep(2)
  }

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
    if (step === 3 && conceptUpdates) {
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
    setStep(Math.max(1, step - 1))
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

          <div className="flex-shrink-0">
            <WizardProgress currentStep={step} steps={STEPS} />
          </div>
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
          <Step1Import
            klaviyoConnections={klaviyoConnections}
            teamConnections={teamConnections}
            hasFigmaConnection={hasFigmaConnection}
            campaignId={campaign.id}
            initialConnectionId={connectionId}
            initialFigmaUrl={campaign.figma_url || ''}
            onComplete={handleStep1Complete}
          />
        )}

        {step === 2 && (
          <EmailSlicer
            campaignId={campaign.id}
            projectId={campaign.project_id!}
            frames={frames}
            sliceMasterImageUrl={campaign.projects?.slice_master_image_url ?? null}
            initialSliceLayout={parseSliceLayout(campaign.projects?.slice_layout_json)}
            klaviyoHybridDndSlot={klaviyoHybridDndSlot}
            onKlaviyoHybridDndSlotChange={setKlaviyoHybridDndSlot}
            onComplete={handleStep2Complete}
            onBack={goBack}
          />
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
              Your Klaviyo connection has expired. Please go back and select an account.
            </p>
            <Button onClick={() => setStep(1)}>
              Go to Step 1
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
