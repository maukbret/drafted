'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, ArrowUpRight, Check } from 'lucide-react'

type SubscriptionTier = 'starter' | 'advanced' | 'pro'

interface TierOption {
  name: string
  tier: SubscriptionTier
  price: number
  klaviyoAccountLimit: number
}

const UPGRADE_OPTIONS: TierOption[] = [
  {
    name: 'Advanced',
    tier: 'advanced',
    price: 59,
    klaviyoAccountLimit: 5,
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: 99,
    klaviyoAccountLimit: 40,
  },
]

interface UpgradePromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTier: SubscriptionTier | null
  currentLimit: number
  currentCount: number
}

type StripeTierPrice = {
  priceId: string
  unitAmount: number
  currency: string
  name: string
}

export function UpgradePrompt({
  open,
  onOpenChange,
  currentTier,
  currentLimit,
  currentCount,
}: UpgradePromptProps) {
  const [loading, setLoading] = useState<SubscriptionTier | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tierPrices, setTierPrices] = useState<Partial<Record<SubscriptionTier, StripeTierPrice>>>({})
  const router = useRouter()

  // Filter to only show tiers higher than current
  const tierOrder: SubscriptionTier[] = ['starter', 'advanced', 'pro']
  const currentTierIndex = currentTier ? tierOrder.indexOf(currentTier) : -1
  const availableUpgrades = UPGRADE_OPTIONS.filter(
    (option) => tierOrder.indexOf(option.tier) > currentTierIndex
  )

  useEffect(() => {
    if (!open) return
    let isMounted = true

    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/billing/prices')
        if (!response.ok) return
        const data = await response.json()
        if (isMounted && data?.tiers) {
          setTierPrices(data.tiers)
        }
      } catch (err) {
        console.error('Failed to load Stripe prices:', err)
      }
    }

    fetchPrices()

    return () => {
      isMounted = false
    }
  }, [open])

  const formatPrice = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount)
    } catch {
      return `${currency} ${amount}`
    }
  }

  const handleUpgrade = async (tier: SubscriptionTier) => {
    setLoading(tier)
    setError(null)

    try {
      const response = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start upgrade')
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Upgrade error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start upgrade')
      setLoading(null)
    }
  }

  const goToBilling = () => {
    onOpenChange(false)
    router.push('/billing')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to add more accounts</DialogTitle>
          <DialogDescription>
            You&apos;ve reached your limit of {currentLimit} Klaviyo account{currentLimit !== 1 ? 's' : ''}.
            Upgrade your plan to connect more accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current usage */}
          <div className="p-6 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Current usage</p>
            <p className="text-lg font-semibold">
              {currentCount} / {currentLimit} Klaviyo accounts
            </p>
          </div>

          {/* Upgrade options */}
          {availableUpgrades.length > 0 ? (
            <div className="space-y-4">
              {availableUpgrades.map((option) => (
                <div
                  key={option.tier}
                  className="flex items-center justify-between p-6 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{tierPrices[option.tier]?.name || option.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Up to {option.klaviyoAccountLimit} Klaviyo accounts
                    </p>
                    <p className="text-sm font-medium mt-1">
                      {tierPrices[option.tier]
                        ? `${formatPrice(tierPrices[option.tier]!.unitAmount, tierPrices[option.tier]!.currency)}/month`
                        : `€${option.price}/month`}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleUpgrade(option.tier)}
                    disabled={loading !== null}
                    size="sm"
                  >
                    {loading === option.tier ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Upgrade
                        <ArrowUpRight className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 border rounded-lg text-center">
              <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="font-medium">You&apos;re on the highest plan</p>
              <p className="text-sm text-muted-foreground mt-1">
                Contact support if you need more capacity.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={goToBilling}>
            View all plans
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
