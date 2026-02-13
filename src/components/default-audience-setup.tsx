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
import { AlertCircle, Loader2 } from 'lucide-react'

interface DefaultAudienceSetupProps {
  connectionId: string
  connectionName: string
  onComplete: () => void
  onCancel: () => void
}

interface DefaultAudienceResponse {
  defaultAudience: {
    includedAudiences: KlaviyoAudience[]
    excludedAudiences: KlaviyoAudience[]
  } | null
  error?: string
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

export function DefaultAudienceSetup({
  connectionId,
  connectionName,
  onComplete,
  onCancel,
}: DefaultAudienceSetupProps) {
  const [includedAudiences, setIncludedAudiences] = useState<KlaviyoAudience[]>([])
  const [excludedAudiences, setExcludedAudiences] = useState<KlaviyoAudience[]>([])
  const [hasExistingDefault, setHasExistingDefault] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [loadingLastUsed, setLoadingLastUsed] = useState(true)
  const [applyingLastUsed, setApplyingLastUsed] = useState(false)
  const [lastUsedAudience, setLastUsedAudience] = useState<LastUsedAudiencePreset | null>(null)
  const [lastUsedError, setLastUsedError] = useState<string | null>(null)
  const [lastUsedWarning, setLastUsedWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    const fetchDefaultAudience = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/klaviyo/default-audience?connectionId=${connectionId}`)
        const data: DefaultAudienceResponse = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load default audience')
        }

        if (!isActive) return

        const defaultAudience = data.defaultAudience
        setIncludedAudiences(defaultAudience?.includedAudiences || [])
        setExcludedAudiences(defaultAudience?.excludedAudiences || [])
        setHasExistingDefault(!!defaultAudience)
      } catch (err) {
        if (!isActive) return
        setError(err instanceof Error ? err.message : 'Failed to load default audience')
      } finally {
        if (!isActive) return
        setLoading(false)
      }
    }

    fetchDefaultAudience()

    return () => {
      isActive = false
    }
  }, [connectionId])

  useEffect(() => {
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
  }, [connectionId])

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

      setIncludedAudiences(validIncludedAudiences)
      setExcludedAudiences(validExcludedAudiences)

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

  const saveDefaultAudience = async () => {
    if (includedAudiences.length === 0) {
      setError('Select at least one audience to include in the default')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/klaviyo/default-audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          includedAudiences,
          excludedAudiences,
        }),
      })

      const data: DefaultAudienceResponse = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save default audience')
      }

      setHasExistingDefault(true)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save default audience')
    } finally {
      setSaving(false)
    }
  }

  const clearDefaultAudience = async () => {
    setClearing(true)
    setError(null)

    try {
      const response = await fetch(`/api/klaviyo/default-audience?connectionId=${connectionId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear default audience')
      }

      setIncludedAudiences([])
      setExcludedAudiences([])
      setHasExistingDefault(false)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear default audience')
    } finally {
      setClearing(false)
    }
  }

  const isBusy = loading || saving || clearing

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
          <DialogTitle>Default audience</DialogTitle>
          <DialogDescription>
            {connectionName} · This preset is shared for campaigns that use this Klaviyo account.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading default audience...
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              In campaign step 3, users can click <span className="font-medium text-foreground">Apply default audience</span> to fill include and exclude audiences from this preset.
            </div>

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

            <AudienceSelector
              connectionId={connectionId}
              selectedAudiences={includedAudiences}
              onChange={setIncludedAudiences}
              label="Default include"
              placeholder="Select lists or segments to include..."
            />

            <AudienceSelector
              connectionId={connectionId}
              selectedAudiences={excludedAudiences}
              onChange={setExcludedAudiences}
              label="Default exclude (optional)"
              placeholder="Select lists or segments to exclude..."
            />

            {error && (
              <div className="p-3 border border-destructive/20 bg-destructive/10 rounded-lg text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              {hasExistingDefault && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearDefaultAudience}
                  disabled={isBusy}
                >
                  {clearing ? 'Clearing...' : 'Clear default'}
                </Button>
              )}
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
                onClick={saveDefaultAudience}
                disabled={isBusy || includedAudiences.length === 0}
              >
                {saving ? 'Saving...' : hasExistingDefault ? 'Update default' : 'Save default'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
