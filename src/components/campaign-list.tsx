'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Campaign } from '@/types/database'

interface CampaignWithConnection extends Campaign {
  klaviyo_connections?: {
    account_name: string | null
  } | null
}

interface CampaignListProps {
  campaigns: CampaignWithConnection[]
}

const STATUS_STYLES: Record<Campaign['status'], { bg: string; text: string; label: string }> = {
  draft: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    label: 'Draft',
  },
  ready: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Ready',
  },
  scheduled: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-600 dark:text-yellow-400',
    label: 'Scheduled',
  },
  sent: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
    label: 'Sent',
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    label: 'Error',
  },
}

export function CampaignList({ campaigns }: CampaignListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  const deleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return

    setDeletingId(id)

    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      router.refresh()
    } catch (err) {
      alert('Failed to delete campaign')
    } finally {
      setDeletingId(null)
    }
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Create your first campaign to get started
        </p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
      {campaigns.map((campaign) => {
        const status = STATUS_STYLES[campaign.status]

        return (
          <div
            key={campaign.id}
            className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="font-medium hover:underline truncate"
                >
                  {campaign.name}
                </Link>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {campaign.klaviyo_connections?.account_name && (
                  <span>{campaign.klaviyo_connections.account_name}</span>
                )}
                {campaign.subject_line && (
                  <span className="truncate max-w-[200px]">{campaign.subject_line}</span>
                )}
                <span>{new Date(campaign.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              {campaign.status === 'draft' && (
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="px-3 py-1.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                >
                  Continue
                </Link>
              )}
              {campaign.status !== 'sent' && (
                <button
                  onClick={() => deleteCampaign(campaign.id)}
                  disabled={deletingId === campaign.id}
                  className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
                >
                  {deletingId === campaign.id ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
