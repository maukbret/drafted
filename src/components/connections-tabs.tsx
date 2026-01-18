'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface KlaviyoConnection {
  id: string
  account_name: string | null
  created_at: string
}

interface FigmaConnection {
  id: string
  figma_email: string | null
  created_at: string
}

interface ConnectionsTabsProps {
  klaviyoConnections: KlaviyoConnection[]
  figmaConnection: FigmaConnection | null
}

export function ConnectionsTabs({ klaviyoConnections, figmaConnection }: ConnectionsTabsProps) {
  const [activeTab, setActiveTab] = useState<'klaviyo' | 'figma'>('klaviyo')
  const [accountName, setAccountName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  const startKlaviyoOAuth = () => {
    if (!accountName.trim()) {
      alert('Please enter an account name')
      return
    }

    // Store account name in cookie for the callback
    document.cookie = `klaviyo_account_name=${encodeURIComponent(accountName.trim())}; path=/; max-age=600; SameSite=Lax`

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier()
    document.cookie = `klaviyo_code_verifier=${codeVerifier}; path=/; max-age=600; SameSite=Lax`

    generateCodeChallenge(codeVerifier).then((codeChallenge) => {
      const state = crypto.randomUUID()
      document.cookie = `klaviyo_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID!,
        redirect_uri: process.env.NEXT_PUBLIC_KLAVIYO_REDIRECT_URI!,
        scope: 'accounts:read images:write templates:write lists:read segments:read campaigns:write',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      })

      window.location.href = `https://www.klaviyo.com/oauth/authorize?${params.toString()}`
    })
  }

  const startFigmaOAuth = () => {
    const state = crypto.randomUUID()
    document.cookie = `figma_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_FIGMA_CLIENT_ID!,
      redirect_uri: process.env.NEXT_PUBLIC_FIGMA_REDIRECT_URI!,
      scope: 'file_content:read',
      state,
      response_type: 'code',
    })

    window.location.href = `https://www.figma.com/oauth?${params.toString()}`
  }

  const deleteConnection = async (type: 'klaviyo' | 'figma', id: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) return

    setDeletingId(id)

    try {
      const response = await fetch(`/api/connections/${type}/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      router.refresh()
    } catch (err) {
      alert('Failed to remove connection')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-800 mb-6">
        <button
          onClick={() => setActiveTab('klaviyo')}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'klaviyo'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Klaviyo ({klaviyoConnections.length})
        </button>
        <button
          onClick={() => setActiveTab('figma')}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'figma'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Figma ({figmaConnection ? 1 : 0})
        </button>
      </div>

      {/* Klaviyo tab content */}
      {activeTab === 'klaviyo' && (
        <div className="space-y-4">
          {klaviyoConnections.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
              {klaviyoConnections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{conn.account_name || 'Unnamed account'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Added {new Date(conn.created_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteConnection('klaviyo', conn.id)}
                    disabled={deletingId === conn.id}
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
                  >
                    {deletingId === conn.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddForm ? (
            <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl space-y-4">
              <div>
                <label htmlFor="account-name" className="block text-sm font-medium mb-1">
                  Account name
                </label>
                <input
                  id="account-name"
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g., Client A, My Store"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Give this connection a name so you can identify it later
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={startKlaviyoOAuth}
                  disabled={!accountName.trim()}
                  className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Connect to Klaviyo
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setAccountName('')
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Add Klaviyo account
            </button>
          )}
        </div>
      )}

      {/* Figma tab content */}
      {activeTab === 'figma' && (
        <div className="space-y-4">
          {figmaConnection ? (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{figmaConnection.figma_email || 'Figma account'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Added {new Date(figmaConnection.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <button
                  onClick={() => deleteConnection('figma', figmaConnection.id)}
                  disabled={deletingId === figmaConnection.id}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
                >
                  {deletingId === figmaConnection.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Connect your Figma account to import designs.
              </p>
              <button
                onClick={startFigmaOAuth}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                Connect Figma
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(Array.from(buffer).map(b => String.fromCharCode(b)).join(''))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
