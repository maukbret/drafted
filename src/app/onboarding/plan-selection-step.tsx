'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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
      '1 team member',
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
      'Unlimited team members',
      'Priority support',
    ],
  },
]

interface PlanSelectionStepProps {
  onComplete: () => void
  isPreview?: boolean
}

export function PlanSelectionStep({
  onComplete,
  isPreview = false,
}: PlanSelectionStepProps) {
  const [loading, setLoading] = useState<SubscriptionTier | null>(null)
  const [isSkipping, setIsSkipping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (isPreview) {
      toast.message('Preview mode', {
        description: 'Checkout is disabled on this static preview page.',
      })
      return
    }
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

  const handleSkipSubscription = async () => {
    if (isPreview) {
      toast.message('Preview mode', {
        description: 'Skipping is disabled on this static preview page.',
      })
      return
    }
    setIsSkipping(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          onboarding_step: 3,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (profileError) {
        throw new Error(`Failed to update profile: ${profileError.message}`)
      }

      onComplete()
    } catch (err) {
      console.error('Skip subscription error:', err)
      setError(err instanceof Error ? err.message : 'Failed to continue without subscription')
      setIsSkipping(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="text-left space-y-1">
        <h1 className="text-2xl font-bold">Choose your plan</h1>
        <p className="text-muted-foreground">
          Select the plan that best fits your needs.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {TIERS.map((tier) => (
          <Card
            key={tier.tier}
            className={cn(
              tier.popular &&
                'border-primary shadow-md ring-1 ring-primary/20'
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                {tier.popular ? <Badge>Most Popular</Badge> : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-3xl font-bold tabular-nums">
                    &euro;{tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
              </div>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="text-sm leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="flex w-full flex-col items-stretch space-y-0 pt-2">
              <Button
                onClick={() => handleSubscribe(tier.tier)}
                disabled={loading !== null || isSkipping}
                className="w-full"
                variant={tier.popular ? 'default' : 'outline'}
                size="default"
              >
                {loading === tier.tier ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Subscribe'
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {error ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Separator />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Secure payment powered by Stripe. Cancel anytime.
        </p>
        <button
          type="button"
          onClick={handleSkipSubscription}
          disabled={loading !== null || isSkipping}
          className="text-left text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50 sm:text-right"
        >
          {isSkipping ? 'Continuing...' : 'Skip for now'}
        </button>
      </div>
    </div>
  )
}
