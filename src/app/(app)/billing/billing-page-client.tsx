'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, ExternalLink, AlertCircle, Check } from 'lucide-react'
import type { Subscription, SubscriptionStatus, SubscriptionTier } from '@/types/database'
import { cn } from '@/lib/utils'

interface BillingPageClientProps {
  subscription: Subscription | null
  klaviyoConnectionCount: number
}

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trialing: { label: 'Trial', variant: 'secondary' },
  active: { label: 'Active', variant: 'default' },
  canceled: { label: 'Canceled', variant: 'destructive' },
  incomplete: { label: 'Incomplete', variant: 'outline' },
  incomplete_expired: { label: 'Expired', variant: 'destructive' },
  past_due: { label: 'Past Due', variant: 'destructive' },
  unpaid: { label: 'Unpaid', variant: 'destructive' },
  paused: { label: 'Paused', variant: 'secondary' },
}

interface TierConfig {
  name: string
  tier: SubscriptionTier
  price: number
  klaviyoAccountLimit: number
  features: string[]
}

const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  starter: {
    name: 'Starter',
    tier: 'starter',
    price: 29,
    klaviyoAccountLimit: 1,
    features: [
      '1 Klaviyo account',
      'Unlimited campaigns',
      '1 team member',
    ],
  },
  advanced: {
    name: 'Advanced',
    tier: 'advanced',
    price: 59,
    klaviyoAccountLimit: 5,
    features: [
      'Up to 5 Klaviyo accounts',
      'Unlimited campaigns',
      'Unlimited team members',
      'Priority support',
    ],
  },
  pro: {
    name: 'Pro',
    tier: 'pro',
    price: 99,
    klaviyoAccountLimit: 20,
    features: [
      'Up to 20 Klaviyo accounts',
      'Unlimited campaigns',
      'Unlimited team members',
      'Priority support',
    ],
  },
}

const TIER_ORDER: SubscriptionTier[] = ['starter', 'advanced', 'pro']

type StripeTierPrice = {
  priceId: string
  unitAmount: number
  currency: string
  productId: string
  name: string
}

export function BillingPageClient({ subscription, klaviyoConnectionCount }: BillingPageClientProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tierPrices, setTierPrices] = useState<Partial<Record<SubscriptionTier, StripeTierPrice>>>({})

  useEffect(() => {
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
  }, [])

  const openPortal = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open billing portal')
      }

      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('Portal error:', err)
      setError(err instanceof Error ? err.message : 'Failed to open billing portal')
      setLoading(false)
    }
  }

  const startSubscription = async (tier: SubscriptionTier = 'starter', priceId?: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier, priceId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start checkout')
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
      setLoading(false)
    }
  }


  const hasActiveSubscription = subscription?.status === 'trialing' || subscription?.status === 'active'
  const statusConfig = subscription ? STATUS_CONFIG[subscription.status] : null
  const currentTier = subscription?.price_tier as SubscriptionTier | null
  const currentTierConfig = currentTier ? TIER_CONFIGS[currentTier] : null
  const currentTierIndex = currentTier ? TIER_ORDER.indexOf(currentTier) : -1

  // Format dates
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const trialEndDate = subscription?.trial_end ? formatDate(subscription.trial_end) : null
  const periodEndDate = subscription?.current_period_end ? formatDate(subscription.current_period_end) : null
  const isCanceling = Boolean(subscription?.cancel_at_period_end && periodEndDate)

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

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground text-sm">Manage your subscription and billing</p>
      </header>

      <div className="space-y-6">
      {/* Subscription status alert for inactive subscriptions */}
      {subscription && !hasActiveSubscription && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Your subscription is {subscription.status}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please update your subscription to continue using the software.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No subscription */}
      {!subscription && (
        <Card className="border-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">No active subscription</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Subscribe to access all features of Mauk.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current plan summary (only when subscribed) */}
      {hasActiveSubscription && currentTierConfig && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>{currentTierConfig.name} Plan</CardTitle>
                  <CardDescription>
                    {subscription?.status === 'trialing' && trialEndDate && (
                      <>Trial ends on {trialEndDate}</>
                    )}
                    {subscription?.status === 'active' && !isCanceling && periodEndDate && (
                      <>Renews on {periodEndDate}</>
                    )}
                    {subscription?.status === 'active' && isCanceling && periodEndDate && (
                      <>Active until {periodEndDate}</>
                    )}
                  </CardDescription>
                </div>
                {statusConfig && (
                  <Badge variant={statusConfig.variant}>
                    {statusConfig.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {isCanceling && periodEndDate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your subscription will remain active until {periodEndDate}. After that, access will end.
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-6">
                <div>
                  <p className="text-sm font-medium">Klaviyo accounts</p>
                  <p className="text-2xl font-bold">
                    {klaviyoConnectionCount}{' '}
                    <span className="text-muted-foreground text-base font-normal">
                      / {currentTierConfig.klaviyoAccountLimit}
                    </span>
                  </p>
                </div>
                {klaviyoConnectionCount >= currentTierConfig.klaviyoAccountLimit && currentTier !== 'pro' && (
                  <Badge variant="outline" className="text-amber-600 border-amber-600">
                    At limit
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={openPortal} disabled={loading} variant="outline" className="flex-1">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      Manage Subscription
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Manage payment method, view invoices, or update/cancel your subscription in the Stripe portal.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/* All plans */}
      <div className="space-y-6 max-w-4xl">
        <h2 className="text-lg font-semibold">
          {hasActiveSubscription ? 'Available Plans' : 'Choose a Plan'}
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {TIER_ORDER.map((tierKey, index) => {
            const tier = TIER_CONFIGS[tierKey]
            const isCurrentTier = tierKey === currentTier
            const tierPrice = tierPrices[tierKey]
            const displayPrice = tierPrice ? formatPrice(tierPrice.unitAmount, tierPrice.currency) : `€${tier.price}`
            const displayName = tierPrice?.name || tier.name

            return (
              <Card
                key={tierKey}
                className={cn(
                  'relative',
                  isCurrentTier && 'border-primary ring-1 ring-primary'
                )}
              >
                {isCurrentTier && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">Current Plan</Badge>
                  </div>
                )}

                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{displayName}</CardTitle>
                  <div>
                    <span className="text-3xl font-bold">{displayPrice}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </CardHeader>

                <CardContent className="flex h-full flex-col gap-4">
                  <ul className="space-y-2">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                    {tier.features.length < 5 && (
                      <li className="flex items-start gap-2 opacity-0" aria-hidden="true">
                        <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">Spacer</span>
                      </li>
                    )}
                  </ul>

                  <div className="mt-2">
                    {!hasActiveSubscription && (
                      <Button
                        onClick={() => startSubscription(tierKey, tierPrice?.priceId)}
                        disabled={loading}
                        className="w-full"
                        variant={tierKey === 'advanced' ? 'default' : 'outline'}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Subscribe'
                        )}
                      </Button>
                    )}

                    {hasActiveSubscription && !isCurrentTier && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={openPortal}
                        disabled={loading}
                      >
                        Manage in Stripe
                      </Button>
                    )}

                    {isCurrentTier && (
                      <Button variant="ghost" className="w-full" disabled>
                        Current plan
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}
