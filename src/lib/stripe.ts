import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
})

// Subscription tier types
export type SubscriptionTier = 'starter' | 'advanced' | 'pro'

export interface TierConfig {
  name: string
  tier: SubscriptionTier
  price: number
  currency: string
  klaviyoAccountLimit: number
  priceId: string
  features: string[]
}

// Price IDs from environment
export const STRIPE_PRICE_STARTER = process.env.STRIPE_PRICE_STARTER!
export const STRIPE_PRICE_ADVANCED = process.env.STRIPE_PRICE_ADVANCED!
export const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO!

// Tier configurations
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  starter: {
    name: 'Starter',
    tier: 'starter',
    price: 29,
    currency: 'EUR',
    klaviyoAccountLimit: 1,
    priceId: STRIPE_PRICE_STARTER,
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
    currency: 'EUR',
    klaviyoAccountLimit: 5,
    priceId: STRIPE_PRICE_ADVANCED,
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
    currency: 'EUR',
    klaviyoAccountLimit: 20,
    priceId: STRIPE_PRICE_PRO,
    features: [
      'Up to 20 Klaviyo accounts',
      'Unlimited campaigns',
      'Unlimited team members',
      'Priority support',
    ],
  },
}

// Helper to get tier from price ID
export function getTierFromPriceId(priceId: string): SubscriptionTier | null {
  for (const [tier, config] of Object.entries(TIER_CONFIGS)) {
    if (config.priceId === priceId) {
      return tier as SubscriptionTier
    }
  }
  return null
}

// Helper to get connection limit for a tier
export function getKlaviyoConnectionLimit(tier: SubscriptionTier | null): number {
  if (!tier) return 0
  return TIER_CONFIGS[tier]?.klaviyoAccountLimit ?? 0
}
