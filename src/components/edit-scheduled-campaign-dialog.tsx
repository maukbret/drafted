'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Settings, Image, RotateCcw, AlertTriangle, Pencil, Link2 } from 'lucide-react'

type EditMode = 'edit_details' | 'edit_slices' | 'edit_design' | 'start_over'

interface EditScheduledCampaignDialogProps {
  campaignId: string
  campaignName: string
  campaignStatus?: 'scheduled' | 'klaviyo_draft'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

const OPTIONS = [
  {
    value: 'edit_details' as EditMode,
    icon: Settings,
    title: 'Edit details',
    description:
      'Change subject line, preview text, audiences, schedule, or send time. The email design stays the same.',
  },
  {
    value: 'edit_slices' as EditMode,
    icon: Link2,
    title: 'Edit slices & links',
    description:
      'Re-slice the email, update links, or adjust the hybrid block. We refresh the frame from Figma first so assets stay in sync (may take a minute).',
  },
  {
    value: 'edit_design' as EditMode,
    icon: Image,
    title: 'Replace design',
    description:
      'Paste a new Figma frame URL when the layout or artwork changed. Send settings stay as they are.',
  },
  {
    value: 'start_over' as EditMode,
    icon: RotateCcw,
    title: 'Start over',
    description: 'Delete everything and start from scratch. This removes the campaign from Klaviyo.',
    destructive: true,
  },
] as const

export function EditScheduledCampaignDialog({
  campaignId,
  campaignName,
  campaignStatus = 'scheduled',
  open,
  onOpenChange,
  trigger,
}: EditScheduledCampaignDialogProps) {
  const isScheduled = campaignStatus === 'scheduled'
  const [selected, setSelected] = React.useState<EditMode>('edit_details')
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelected('edit_details')
      setShowConfirm(false)
      setError(null)
    }
    onOpenChange?.(nextOpen)
  }

  const handleContinue = () => {
    if (selected === 'start_over') {
      setShowConfirm(true)
      return
    }
    submit(selected)
  }

  const submit = async (mode: EditMode) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error || 'Failed to cancel the scheduled campaign')
        return
      }

      handleOpenChange(false)

      if (data.redirectToCampaigns) {
        router.push('/campaigns')
        router.refresh()
        return
      }

      const targetId = data.redirectTo || campaignId
      const href =
        mode === 'edit_design'
          ? `/campaigns/${targetId}?reimport=1`
          : mode === 'edit_slices'
            ? `/campaigns/${targetId}?reslice=1`
            : `/campaigns/${targetId}`
      router.push(href)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const dialogContent = showConfirm ? (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This will delete &quot;{campaignName}&quot; from Klaviyo and cannot be undone.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => { setShowConfirm(false); setError(null) }}
          disabled={isSubmitting}
        >
          Go back
        </Button>
        <Button
          variant="destructive"
          onClick={() => submit('start_over')}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Processing...' : 'Start over'}
        </Button>
      </DialogFooter>
    </>
  ) : (
    <>
      <DialogHeader>
        <DialogTitle>{isScheduled ? 'Edit scheduled campaign' : 'Edit campaign'}</DialogTitle>
        <DialogDescription>
          {isScheduled
            ? 'This will cancel the scheduled send. Choose how you\u2019d like to continue.'
            : 'Choose how you\u2019d like to edit this campaign.'}
        </DialogDescription>
      </DialogHeader>

      <RadioGroup
        value={selected}
        onValueChange={(v) => setSelected(v as EditMode)}
        className="gap-3"
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const isSelected = selected === option.value
          const isDestructive = 'destructive' in option && option.destructive

          return (
            <label
              key={option.value}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                isSelected
                  ? isDestructive
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                isDestructive ? 'text-destructive' : 'text-muted-foreground'
              }`} />
              <div className="space-y-1">
                <p className={`text-sm font-medium leading-none ${
                  isDestructive ? 'text-destructive' : ''
                }`}>
                  {option.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </label>
          )
        })}
      </RadioGroup>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleContinue}
          disabled={isSubmitting}
          variant={selected === 'start_over' ? 'destructive' : 'default'}
        >
          {isSubmitting ? 'Processing...' : 'Continue'}
        </Button>
      </DialogFooter>
    </>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        {dialogContent}
      </DialogContent>
    </Dialog>
  )
}

export function EditScheduledCampaignButton({
  campaignId,
  campaignName,
  campaignStatus = 'scheduled',
}: {
  campaignId: string
  campaignName: string
  campaignStatus?: 'scheduled' | 'klaviyo_draft'
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <EditScheduledCampaignDialog
      campaignId={campaignId}
      campaignName={campaignName}
      campaignStatus={campaignStatus}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1.5" />
          Edit Campaign
        </Button>
      }
    />
  )
}
