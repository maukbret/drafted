'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

export default function ToastsDevPage() {
  useEffect(() => {
    toast.loading('Saving settings...', { id: 'settings', duration: Infinity })
    toast.success('Images uploaded', { id: 'images', duration: Infinity })
    toast.success('Template created', { id: 'template', duration: Infinity })
    toast.loading('Creating campaign...', { id: 'campaign', duration: Infinity })
    toast.success('Draft saved', {
      id: 'finalizing',
      duration: Infinity,
      action: {
        label: 'View in Klaviyo',
        onClick: () => {},
      },
    })
    toast.error('Failed to create campaign in Klaviyo', { id: 'error', duration: Infinity })
  }, [])

  return (
    <div className="p-8 max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Toast Styling Dev Page</h1>
      <p className="text-sm text-muted-foreground">
        All toast variants are shown bottom-right. Refresh to reset.
      </p>
      <button
        className="text-sm underline"
        onClick={() => {
          toast.dismiss()
          setTimeout(() => {
            toast.loading('Saving settings...', { id: 'settings', duration: Infinity })
            toast.success('Images uploaded', { id: 'images', duration: Infinity })
            toast.success('Template created', { id: 'template', duration: Infinity })
            toast.loading('Creating campaign...', { id: 'campaign', duration: Infinity })
            toast.success('Draft saved', {
              id: 'finalizing',
              duration: Infinity,
              action: {
                label: 'View in Klaviyo',
                onClick: () => {},
              },
            })
            toast.error('Failed to create campaign in Klaviyo', { id: 'error', duration: Infinity })
          }, 100)
        }}
      >
        Reset toasts
      </button>
    </div>
  )
}
