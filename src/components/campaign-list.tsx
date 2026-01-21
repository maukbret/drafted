'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteModalCampaign, setDeleteModalCampaign] = useState<CampaignWithConnection | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDelete = async () => {
    if (!deleteModalCampaign) return

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/campaigns/${deleteModalCampaign.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      setDeleteModalCampaign(null)
      router.refresh()
    } catch (err) {
      alert('Failed to delete campaign')
    } finally {
      setIsDeleting(false)
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
    <>
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-200 dark:divide-gray-800">
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
                    href={`/campaigns/${campaign.id}`}
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
                    href={`/campaigns/${campaign.id}`}
                    className="px-3 py-1.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                  >
                    Continue
                  </Link>
                )}
                {campaign.status === 'ready' && campaign.klaviyo_campaign_id && (
                  <a
                    href={`https://www.klaviyo.com/campaign/${campaign.klaviyo_campaign_id}/scheduled`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                  >
                    View in Klaviyo
                  </a>
                )}

                {/* Options menu */}
                <div className="relative" ref={openMenuId === campaign.id ? menuRef : null}>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="6" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="18" r="1.5" />
                    </svg>
                  </button>

                  {openMenuId === campaign.id && (
                    <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => setOpenMenuId(null)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Link>
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setDeleteModalCampaign(campaign)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete confirmation modal */}
      {deleteModalCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isDeleting && setDeleteModalCampaign(null)}
          />

          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Delete campaign</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete <span className="font-medium">&quot;{deleteModalCampaign.name}&quot;</span>? This will permanently remove the campaign from your account.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModalCampaign(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
