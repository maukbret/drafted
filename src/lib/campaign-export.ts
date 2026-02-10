import { toast } from 'sonner'

interface ExportSettings {
  name: string
  subjectLine: string
  previewText: string | null
  includedAudiences: { id: string; name: string }[]
  excludedAudiences: { id: string; name: string }[]
  scheduledDate: string
  scheduledTime: string
  timezone: string
  useRecipientTimezone: boolean
  useCustomFooter: boolean
}

interface StepConfig {
  loading: string
  success: string
}

function getStepConfigs(asDraft: boolean, isUpdate: boolean): Record<string, StepConfig> {
  return {
    settings: {
      loading: 'Saving settings...',
      success: 'Settings saved',
    },
    images: {
      loading: 'Uploading images...',
      success: 'Images uploaded',
    },
    template: {
      loading: isUpdate ? 'Updating template...' : 'Creating template...',
      success: isUpdate ? 'Template updated' : 'Template created',
    },
    campaign: {
      loading: isUpdate ? 'Updating campaign...' : 'Creating campaign...',
      success: isUpdate ? 'Campaign updated' : 'Campaign created',
    },
    finalizing: {
      loading: asDraft ? 'Saving as draft...' : 'Scheduling campaign...',
      success: asDraft ? 'Draft saved' : 'Campaign scheduled',
    },
  }
}

export function startCampaignExport(
  campaignId: string,
  settings: ExportSettings,
  asDraft: boolean,
  isUpdate: boolean,
) {
  const stepConfigs = getStepConfigs(asDraft, isUpdate)
  const toastIds: Record<string, string | number> = {}

  async function run() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asDraft, settings }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) {
        toast.error('Failed to start export')
        return
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const data = JSON.parse(line)
            processMessage(data, stepConfigs, toastIds)
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer)
          processMessage(data, stepConfigs, toastIds)
        } catch {
          // Skip unparseable lines
        }
      }
    } catch {
      toast.error('Campaign export failed. Please try again.')
    }
  }

  // Fire and forget
  run()
}

function processMessage(
  data: { step: string; status?: string; message?: string; klaviyoCampaignId?: string; label?: string },
  stepConfigs: Record<string, StepConfig>,
  toastIds: Record<string, string | number>,
) {
  if (data.step === 'error') {
    toast.error(data.message || 'An error occurred')
    return
  }

  if (data.step === 'done') {
    // Update the finalizing toast with a "View in Klaviyo" action
    const finalizingToastId = toastIds['finalizing']
    const config = stepConfigs['finalizing']
    if (finalizingToastId && data.klaviyoCampaignId) {
      const klaviyoUrl = `https://www.klaviyo.com/campaign/${data.klaviyoCampaignId}/scheduled`
      toast.success(config?.success || 'Export complete', {
        id: finalizingToastId,
        action: {
          label: 'View in Klaviyo',
          onClick: () => window.open(klaviyoUrl, '_blank'),
        },
      })
    }
    return
  }

  const config = stepConfigs[data.step]
  if (!config) return

  if (data.status === 'in_progress') {
    const id = toast.loading(data.label ? `${data.label}...` : config.loading)
    toastIds[data.step] = id
  } else if (data.status === 'complete') {
    const existingId = toastIds[data.step]
    if (existingId) {
      toast.success(config.success, { id: existingId })
    }
  }
  // 'skip' status → no toast shown
}
