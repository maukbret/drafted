'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { WizardProgress } from './wizard-progress'
import { Step1Import } from './step-1-import'
import { Step2Editor } from './step-2-editor'
import { EmailSlicer } from './email-slicer'
import { Step3Settings } from './step-3-settings'
import { CampaignLeaveGuard } from './leave-campaign-guard'
import { Campaign, KlaviyoAudience } from '@/types/database'
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
  link_url: string | null
  display_order: number
}

interface ProductFeedSettings {
  feedName: string
  productCount: number
}

interface CampaignWizardProps {
  campaign: Campaign & {
    klaviyo_connections?: { account_name: string | null; store_url?: string | null } | null
    projects?: {
      frames?: Frame[]
    } | null
  }
  klaviyoConnections: KlaviyoConnection[]
  teamConnections?: KlaviyoConnection[]
  hasFigmaConnection: boolean
  canUseProductFeed: boolean
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
  canUseProductFeed,
  campaignName,
}: CampaignWizardProps) {
  const router = useRouter()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [step, setStep] = useState(initialCampaign.wizard_step || 1)
  const [frames, setFrames] = useState<Frame[]>(initialCampaign.projects?.frames || [])
  // Track connectionId separately to handle reconnection scenarios
  const [connectionId, setConnectionId] = useState(initialCampaign.klaviyo_connection_id || '')
  const [sliceMode, setSliceMode] = useState(initialCampaign.slice_mode || false)
  // Track whether slices have been finalized (so going back shows the link editor, not the slicer)
  const [slicesFinalized, setSlicesFinalized] = useState(
    // If resuming a campaign that's already past step 2 in slice mode, slices are finalized
    initialCampaign.slice_mode && (initialCampaign.wizard_step || 1) > 2
  )
  const [conceptUpdates, setConceptUpdates] = useState<Record<string, unknown> | null>(null)
  const [productFeedSettings, setProductFeedSettings] = useState<ProductFeedSettings | null>(
    (initialCampaign as any).product_feed_settings || null
  )
  const [hasProductFeedPreset, setHasProductFeedPreset] = useState<boolean | null>(null)
  const [useProductFeed, setUseProductFeed] = useState(!!((initialCampaign as any).product_feed_settings))
  const [feedName, setFeedName] = useState((initialCampaign as any).product_feed_settings?.feedName || '')
  const [productCount, setProductCount] = useState(String((initialCampaign as any).product_feed_settings?.productCount || 3))

  // Fetch product feed preset status whenever connectionId changes
  const checkProductFeedPreset = useCallback(async (connId: string) => {
    try {
      const response = await fetch(`/api/klaviyo/product-feed-preset?connectionId=${connId}`)
      if (!response.ok) throw new Error('Failed to check preset')
      const data = await response.json()
      setHasProductFeedPreset(!!data.preset)
    } catch {
      setHasProductFeedPreset(false)
    }
  }, [])

  useEffect(() => {
    if (connectionId && canUseProductFeed) {
      checkProductFeedPreset(connectionId)
    }
  }, [connectionId, canUseProductFeed, checkProductFeedPreset])

  // Update wizard step in database when it changes
  useEffect(() => {
    if (step !== campaign.wizard_step) {
      fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wizard_step: step }),
      })
    }
  }, [step, campaign.id, campaign.wizard_step])

  const handleStep1Complete = async (data: { connectionId: string; figmaUrl: string; sliceMode: boolean }) => {
    // Store the selected connection ID and slice mode in state
    setConnectionId(data.connectionId)
    setSliceMode(data.sliceMode)

    // Save the connection ID and slice_mode to the campaign
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klaviyo_connection_id: data.connectionId, slice_mode: data.sliceMode }),
    })

    // Fetch updated campaign with frames
    const response = await fetch(`/api/campaigns/${campaign.id}`)
    if (response.ok) {
      const { campaign: updatedCampaign } = await response.json()
      setCampaign(updatedCampaign)
      setFrames(updatedCampaign.projects?.frames || [])
    }
    setSlicesFinalized(false)
    setStep(2)
  }

  const saveProductFeedSettings = useCallback(() => {
    if (!canUseProductFeed) return productFeedSettings

    const pfSettings = useProductFeed && feedName.trim()
      ? { feedName: feedName.trim(), productCount: parseInt(productCount, 10) || 3 }
      : null
    setProductFeedSettings(pfSettings)
    fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_feed_settings: pfSettings }),
    })
    return pfSettings
  }, [canUseProductFeed, productFeedSettings, useProductFeed, feedName, productCount, campaign.id])

  const handleStep2Complete = (updatedFrames: Frame[]) => {
    setFrames(updatedFrames)
    if (sliceMode) setSlicesFinalized(true)
    saveProductFeedSettings()
    setStep(3)
  }

  const handleStep3Complete = () => {
    router.push('/campaigns')
  }

  const goBack = () => {
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
        isActive={campaign.status === 'in_progress' || (campaign.status as string) === 'concept'}
        campaignStatus={campaign.status}
        getConceptUpdates={() => conceptUpdates}
      />
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

        {step === 2 && sliceMode && !slicesFinalized && (
          <EmailSlicer
            campaignId={campaign.id}
            projectId={campaign.project_id!}
            frames={frames}
            onComplete={handleStep2Complete}
            onBack={goBack}
            productFeed={canUseProductFeed ? {
              connectionId: connectionId,
              hasProductFeedPreset: hasProductFeedPreset,
              useProductFeed: useProductFeed,
              onUseProductFeedChange: setUseProductFeed,
              feedName: feedName,
              onFeedNameChange: setFeedName,
              productCount: productCount,
              onProductCountChange: setProductCount,
            } : undefined}
          />
        )}

        {step === 2 && (!sliceMode || slicesFinalized) && (
          <Step2Editor
            frames={frames}
            defaultLinkPlaceholder={selectedAccount?.store_url || ''}
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
            initialProductFeedSettings={productFeedSettings}
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
      </div>
    </div>
  )
}
