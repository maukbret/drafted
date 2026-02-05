'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type SubscriptionTier = 'starter' | 'advanced' | 'pro'

interface TierConfig {
  name: string
  tier: SubscriptionTier
  price: number
  klaviyoAccountLimit: number
  features: string[]
  popular?: boolean
}

const TIERS: TierConfig[] = [
  {
    name: 'Starter',
    tier: 'starter',
    price: 29,
    klaviyoAccountLimit: 1,
    features: [
      '1 Klaviyo account',
      'Unlimited campaigns',
      'Figma to Klaviyo export',
      'Unlimited team members',
    ],
  },
  {
    name: 'Advanced',
    tier: 'advanced',
    price: 59,
    klaviyoAccountLimit: 5,
    features: [
      'Up to 5 Klaviyo accounts',
      'Unlimited campaigns',
      'Figma to Klaviyo export',
      'Unlimited team members',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: 99,
    klaviyoAccountLimit: 20,
    features: [
      'Up to 20 Klaviyo accounts',
      'Unlimited campaigns',
      'Figma to Klaviyo export',
      'Unlimited team members',
      'Priority support',
    ],
  },
]

export function PlanSelectionStep() {
  const [loading, setLoading] = useState<SubscriptionTier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async (tier: SubscriptionTier) => {
    setLoading(tier)
    setError(null)

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier }),
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
      setLoading(null)
    }
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl">Choose your plan</CardTitle>
        <CardDescription>
          Select the plan that best fits your needs. All plans include unlimited team members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tier cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.tier}
              className={cn(
                'border rounded-lg p-5 space-y-4 relative',
                tier.popular && 'border-primary ring-1 ring-primary'
              )}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold">€{tier.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              <ul className="space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleSubscribe(tier.tier)}
                disabled={loading !== null}
                className="w-full"
                variant={tier.popular ? 'default' : 'outline'}
              >
                {loading === tier.tier ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Subscribe'
                )}
              </Button>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Secure payment powered by Stripe. Cancel anytime.
        </p>
      </CardContent>
    </Card>
  )
}
