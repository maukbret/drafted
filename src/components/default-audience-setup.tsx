'use client'

import { useEffect, useState } from 'react'
import { AudienceSelector } from '@/components/audience-selector'
import { KlaviyoAudience } from '@/types/database'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react'

interface DefaultAudienceSetupProps {
  connectionId: string
  connectionName: string
  onComplete: () => void
  onCancel: () => void
}

interface PresetFromApi {
  id: string
  name: string
  includedAudiences: KlaviyoAudience[]
  excludedAudiences: KlaviyoAudience[]
}

interface PresetDraft {
  id?: string
  name: string
  includedAudiences: KlaviyoAudience[]
  excludedAudiences: KlaviyoAudience[]
}

interface LastUsedAudiencePreset {
  campaignName: string
  sentAt: string | null
  includedAudiences: KlaviyoAudience[]
  excludedAudiences: KlaviyoAudience[]
}

interface LastUsedAudienceResponse {
  lastUsedAudience: LastUsedAudiencePreset | null
  error?: string
}

const MAX_PRESETS = 3

export function DefaultAudienceSetup({
  connectionId,
  connectionName,
  onComplete,
  onCancel,
}: DefaultAudienceSetupProps) {
  const [presets, setPresets] = useState<PresetDraft[]>([])
  const [activeTab, setActiveTab] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadingLastUsed, setLoadingLastUsed] = useState(true)
  const [applyingLastUsed, setApplyingLastUsed] = useState(false)
  const [lastUsedAudience, setLastUsedAudience] = useState<LastUsedAudiencePreset | null>(null)
  const [lastUsedError, setLastUsedError] = useState<string | null>(null)
  const [lastUsedWarning, setLastUsedWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    const fetchPresets = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/klaviyo/default-audience?connectionId=${connectionId}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load presets')
        }

        if (!isActive) return

        const apiPresets: PresetFromApi[] = data.presets || []
        if (apiPresets.length > 0) {
          setPresets(apiPresets.map((p) => ({
            id: p.id,
            name: p.name,
            includedAudiences: p.includedAudiences,
            excludedAudiences: p.excludedAudiences,
          })))
        } else {
          // Start with one empty preset
          setPresets([{ name: 'Default', includedAudiences: [], excludedAudiences: [] }])
        }
      } catch (err) {
        if (!isActive) return
        setError(err instanceof Error ? err.message : 'Failed to load presets')
      } finally {
        if (!isActive) return
        setLoading(false)
      }
    }

    fetchPresets()

    return () => {
      isActive = false
    }
  }, [connectionId])

  // Only show "last used audience" when no presets exist yet (first-time setup)
  const hasExistingPresets = presets.some((p) => !!p.id)

  useEffect(() => {
    // Skip fetching last used audience if user already has saved presets
    if (loading || hasExistingPresets) {
      setLoadingLastUsed(false)
      return
    }

    let isActive = true

    const fetchLastUsedAudience = async () => {
      setLoadingLastUsed(true)
      setLastUsedError(null)
      setLastUsedWarning(null)

      try {
        const response = await fetch(`/api/klaviyo/last-used-audience?connectionId=${connectionId}`)
        const data: LastUsedAudienceResponse = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load last used audience')
        }

        if (!isActive) return
        setLastUsedAudience(data.lastUsedAudience || null)
      } catch (err) {
        if (!isActive) return
        setLastUsedAudience(null)
        setLastUsedError(err instanceof Error ? err.message : 'Failed to load last used audience')
      } finally {
        if (!isActive) return
        setLoadingLastUsed(false)
      }
    }

    fetchLastUsedAudience()

    return () => {
      isActive = false
    }
  }, [connectionId, loading, hasExistingPresets])

  const activeIndex = parseInt(activeTab, 10)
  const activePreset = presets[activeIndex]

  const updateActivePreset = (updates: Partial<PresetDraft>) => {
    setPresets((prev) => prev.map((p, i) => i === activeIndex ? { ...p, ...updates } : p))
  }

  const applyLastUsedAudience = async () => {
    if (!lastUsedAudience || applyingLastUsed) return

    setApplyingLastUsed(true)
    setLastUsedError(null)
    setLastUsedWarning(null)

    try {
      const response = await fetch(`/api/klaviyo/audiences?connectionId=${connectionId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load current audiences')
      }

      const availableAudiences = (data.audiences || []) as KlaviyoAudience[]
      const audiencesById = new Map(
        availableAudiences.map((audience) => [audience.id, audience])
      )

      const resolveAudiences = (audiences: KlaviyoAudience[]) => (
        audiences
          .map((audience) => audiencesById.get(audience.id))
          .filter((audience): audience is KlaviyoAudience => !!audience)
      )

      const validIncludedAudiences = resolveAudiences(lastUsedAudience.includedAudiences)
      const validExcludedAudiences = resolveAudiences(lastUsedAudience.excludedAudiences)
      const missingCount =
        (lastUsedAudience.includedAudiences.length - validIncludedAudiences.length) +
        (lastUsedAudience.excludedAudiences.length - validExcludedAudiences.length)

      updateActivePreset({
        includedAudiences: validIncludedAudiences,
        excludedAudiences: validExcludedAudiences,
      })

      if (missingCount > 0) {
        setLastUsedWarning(
          `${missingCount} audience${missingCount === 1 ? '' : 's'} from this campaign no longer exist in Klaviyo. We applied the remaining audiences.`
        )
      }
    } catch (err) {
      setLastUsedError(err instanceof Error ? err.message : 'Failed to apply last used audience')
    } finally {
      setApplyingLastUsed(false)
    }
  }

  const addPreset = () => {
    if (presets.length >= MAX_PRESETS) return
    const newIndex = presets.length
    setPresets((prev) => [...prev, { name: '', includedAudiences: [], excludedAudiences: [] }])
    setActiveTab(String(newIndex))
  }

  const saveAllPresets = async () => {
    // Validate all presets before saving
    for (const preset of presets) {
      if (!preset.name.trim()) {
        setError('All presets must have a name')
        return
      }
      if (preset.includedAudiences.length === 0) {
        setError(`Preset "${preset.name || 'Untitled'}" needs at least one included audience`)
        return
      }
    }

    // Check for duplicate names
    const names = presets.map((p) => p.name.trim().toLowerCase())
    if (new Set(names).size !== names.length) {
      setError('Each preset must have a unique name')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const updatedPresets = [...presets]

      for (let i = 0; i < presets.length; i++) {
        const preset = presets[i]
        const response = await fetch('/api/klaviyo/default-audience', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId,
            presetId: preset.id,
            presetName: preset.name.trim(),
            includedAudiences: preset.includedAudiences,
            excludedAudiences: preset.excludedAudiences,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || `Failed to save preset "${preset.name}"`)
        }

        const savedPreset = data.preset as PresetFromApi
        updatedPresets[i] = {
          id: savedPreset.id,
          name: savedPreset.name,
          includedAudiences: savedPreset.includedAudiences,
          excludedAudiences: savedPreset.excludedAudiences,
        }
      }

      setPresets(updatedPresets)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save presets')
    } finally {
      setSaving(false)
    }
  }

  const deletePreset = async () => {
    if (!activePreset) return

    if (!activePreset.id) {
      // Unsaved preset, just remove from local state
      setPresets((prev) => prev.filter((_, i) => i !== activeIndex))
      setActiveTab('0')
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/klaviyo/default-audience?connectionId=${connectionId}&presetId=${activePreset.id}`,
        { method: 'DELETE' }
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete preset')
      }

      const remaining = presets.filter((_, i) => i !== activeIndex)
      setPresets(remaining)
      setActiveTab('0')

      if (remaining.length === 0) {
        onComplete()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset')
    } finally {
      setDeleting(false)
    }
  }

  const isBusy = loading || saving || deleting

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isBusy) {
          onCancel()
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audience presets</DialogTitle>
          <DialogDescription>
            {connectionName} · Manage up to {MAX_PRESETS} audience presets for this account.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading presets...
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center gap-2">
                <TabsList className="flex-1">
                  {presets.map((preset, index) => (
                    <TabsTrigger key={index} value={String(index)} className="flex-1 truncate">
                      {preset.name || 'Untitled'}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {presets.length < MAX_PRESETS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={addPreset}
                    disabled={isBusy}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {presets.map((preset, index) => (
                <TabsContent key={index} value={String(index)} className="space-y-6 mt-4">
                  <div>
                    <Label htmlFor={`preset-name-${index}`}>Preset name</Label>
                    <Input
                      id={`preset-name-${index}`}
                      value={preset.name}
                      onChange={(e) => updateActivePreset({ name: e.target.value })}
                      placeholder="e.g. English market"
                      maxLength={50}
                      className="mt-1.5"
                    />
                  </div>

                  {!hasExistingPresets && (
                    <>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Last used audience</p>
                            <p className="text-xs text-muted-foreground">
                              {loadingLastUsed
                                ? 'Loading last used audience...'
                                : lastUsedAudience
                                  ? `${lastUsedAudience.campaignName} · ${lastUsedAudience.includedAudiences.length} include · ${lastUsedAudience.excludedAudiences.length} exclude`
                                  : 'No sent campaigns found'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={applyLastUsedAudience}
                            disabled={isBusy || loadingLastUsed || !lastUsedAudience || applyingLastUsed}
                            className="rounded-full"
                          >
                            {applyingLastUsed ? 'Applying...' : 'Apply last used'}
                          </Button>
                        </div>
                      </div>

                      {lastUsedError && (
                        <div className="p-3 border border-destructive/20 bg-destructive/10 rounded-lg text-sm text-destructive flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{lastUsedError}</span>
                        </div>
                      )}

                      {lastUsedWarning && (
                        <div className="p-3 border border-amber-500/40 bg-amber-500/10 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                          {lastUsedWarning}
                        </div>
                      )}
                    </>
                  )}

                  <AudienceSelector
                    connectionId={connectionId}
                    selectedAudiences={preset.includedAudiences}
                    onChange={(audiences) => updateActivePreset({ includedAudiences: audiences })}
                    label="Default include"
                    placeholder="Select lists or segments to include..."
                  />

                  <AudienceSelector
                    connectionId={connectionId}
                    selectedAudiences={preset.excludedAudiences}
                    onChange={(audiences) => updateActivePreset({ excludedAudiences: audiences })}
                    label="Default exclude (optional)"
                    placeholder="Select lists or segments to exclude..."
                  />
                </TabsContent>
              ))}
            </Tabs>

            {error && (
              <div className="p-3 border border-destructive/20 bg-destructive/10 rounded-lg text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-between">
              <div>
                {activePreset && (presets.length > 1 || activePreset.id) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={deletePreset}
                    disabled={isBusy}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    {deleting ? 'Deleting...' : 'Delete preset'}
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isBusy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveAllPresets}
                  disabled={isBusy || presets.length === 0 || presets.some((p) => p.includedAudiences.length === 0)}
                >
                  {saving ? 'Saving...' : presets.every((p) => p.id) ? 'Update presets' : 'Save presets'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
