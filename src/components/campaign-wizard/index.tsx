'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WizardProgress } from './wizard-progress'
import { Step1Import } from './step-1-import'
import { Step2Editor } from './step-2-editor'
import { Step3Settings } from './step-3-settings'
import { Campaign, KlaviyoAudience } from '@/types/database'

interface KlaviyoConnection {
  id: string
  account_name: string | null
}

interface Frame {
  id: string
  figma_node_id: string
  name: string
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
            initialConnectionId={campaign.klaviyo_connection_id}
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

        {step === 3 && (
          <Step3Settings
            campaignId={campaign.id}
            connectionId={campaign.klaviyo_connection_id}
            initialName={campaign.name}
            initialSubjectLine={campaign.subject_line || ''}
            initialPreviewText={campaign.preview_text || ''}
            initialIncludedAudiences={campaign.included_audiences as KlaviyoAudience[] || []}
            initialExcludedAudiences={campaign.excluded_audiences as KlaviyoAudience[] || []}
            onComplete={handleStep3Complete}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  )
}
