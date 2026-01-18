'use client'

import { useState, useEffect } from 'react'
import { KlaviyoAudience } from '@/types/database'

interface AudienceSelectorProps {
  connectionId: string
  selectedAudiences: KlaviyoAudience[]
  onChange: (audiences: KlaviyoAudience[]) => void
  label?: string
  placeholder?: string
}

export function AudienceSelector({
  connectionId,
  selectedAudiences,
  onChange,
  label = 'Audiences',
  placeholder = 'Select audiences...',
}: AudienceSelectorProps) {
  const [audiences, setAudiences] = useState<KlaviyoAudience[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchAudiences = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/klaviyo/audiences?connectionId=${connectionId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch audiences')
        }

        const data = await response.json()
        setAudiences(data.audiences || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audiences')
      } finally {
        setLoading(false)
      }
    }

    if (connectionId) {
      fetchAudiences()
    }
  }, [connectionId])

  const filteredAudiences = audiences.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleAudience = (audience: KlaviyoAudience) => {
    const isSelected = selectedAudiences.some((a) => a.id === audience.id)
    if (isSelected) {
      onChange(selectedAudiences.filter((a) => a.id !== audience.id))
    } else {
      onChange([...selectedAudiences, audience])
    }
  }

  const removeAudience = (audienceId: string) => {
    onChange(selectedAudiences.filter((a) => a.id !== audienceId))
  }

  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>
        <div className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-500">
          Loading audiences...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>
        <div className="px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-1">{label}</label>

      {/* Selected audiences */}
      {selectedAudiences.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedAudiences.map((audience) => (
            <span
              key={audience.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
            >
              <span className={`w-2 h-2 rounded-full ${audience.type === 'list' ? 'bg-blue-500' : 'bg-purple-500'}`} />
              {audience.name}
              <button
                type="button"
                onClick={() => removeAudience(audience.id)}
                className="ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm flex items-center justify-between"
      >
        <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audiences..."
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredAudiences.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No audiences found</div>
            ) : (
              filteredAudiences.map((audience) => {
                const isSelected = selectedAudiences.some((a) => a.id === audience.id)
                return (
                  <button
                    key={audience.id}
                    type="button"
                    onClick={() => toggleAudience(audience)}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      isSelected ? 'bg-gray-50 dark:bg-gray-800/50' : ''
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${audience.type === 'list' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                    <span className="flex-1">{audience.name}</span>
                    <span className="text-xs text-gray-400">{audience.type}</span>
                    {isSelected && (
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
