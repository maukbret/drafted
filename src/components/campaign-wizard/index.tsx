'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WizardProgress } from './wizard-progress'
import { Step1Import } from './step-1-import'
import { Step2Editor } from './step-2-editor'
import { Step3Settings } from './step-3-settings'
import { Campaign, KlaviyoAudience } from '@/types/database'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface KlaviyoConnection {
  id: string
  account_name: string | null
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

interface CampaignWizardProps {
  campaign: Campaign & {
    klaviyo_connections?: { account_name: string | null } | null
    projects?: {
      frames?: Frame[]
    } | null
  }
  klaviyoConnections: KlaviyoConnection[]
  hasFigmaConnection: boolean
}

const STEPS = [
  { label: 'Import', description: 'Select Figma design' },
  { label: 'Edit', description: 'Add links' },
  { label: 'Send', description: 'Configure & send' },
]

export function CampaignWizard({
  campaign: initialCampaign,
  klaviyoConnections,
  hasFigmaConnection,
}: CampaignWizardProps) {
  const router = useRouter()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [step, setStep] = useState(initialCampaign.wizard_step || 1)
  const [frames, setFrames] = useState<Frame[]>(initialCampaign.projects?.frames || [])
  // Track connectionId separately to handle reconnection scenarios
  const [connectionId, setConnectionId] = useState(initialCampaign.klaviyo_connection_id || '')

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

  const handleStep1Complete = async (data: { connectionId: string; figmaUrl: string }) => {
    // Store the selected connection ID in state and database
    setConnectionId(data.connectionId)

    // Save the connection ID to the campaign
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klaviyo_connection_id: data.connectionId }),
    })

    // Fetch updated campaign with frames
    const response = await fetch(`/api/campaigns/${campaign.id}`)
    if (response.ok) {
      const { campaign: updatedCampaign } = await response.json()
      setCampaign(updatedCampaign)
      setFrames(updatedCampaign.projects?.frames || [])
    }
    setStep(2)
  }

  const handleStep2Complete = (updatedFrames: Frame[]) => {
    setFrames(updatedFrames)
    setStep(3)
  }

  const handleStep3Complete = () => {
    router.push('/campaigns')
  }

  const goBack = () => {
    setStep(Math.max(1, step - 1))
  }

  return (
    <div>
      <WizardProgress currentStep={step} steps={STEPS} />

      <div className="mt-8">
        {step === 1 && (
          <Step1Import
            klaviyoConnections={klaviyoConnections}
            hasFigmaConnection={hasFigmaConnection}
            campaignId={campaign.id}
            initialConnectionId={connectionId}
            initialFigmaUrl={campaign.figma_url || ''}
            onComplete={handleStep1Complete}
          />
        )}

        {step === 2 && (
          <Step2Editor
            frames={frames}
            onComplete={handleStep2Complete}
            onBack={goBack}
          />
        )}

        {step === 3 && connectionId && (
          <Step3Settings
            campaignId={campaign.id}
            connectionId={connectionId}
            initialName={campaign.name}
            initialSubjectLine={campaign.subject_line || ''}
            initialPreviewText={campaign.preview_text || ''}
            initialIncludedAudiences={campaign.included_audiences as KlaviyoAudience[] || []}
            initialExcludedAudiences={campaign.excluded_audiences as KlaviyoAudience[] || []}
            initialScheduledAt={campaign.scheduled_at || null}
            isUpdate={!!(campaign.klaviyo_template_id && campaign.klaviyo_campaign_id)}
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
