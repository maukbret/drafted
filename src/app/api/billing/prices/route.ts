import { NextResponse } from 'next/server'
import { stripe, SubscriptionTier } from '@/lib/stripe'
import type Stripe from 'stripe'

const VALID_TIERS: SubscriptionTier[] = ['starter', 'advanced', 'pro']

export async function GET() {
  try {
    const prices = await stripe.prices.list({
      active: true,
      limit: 100,
      expand: ['data.product'],
    })

    const tiers: Record<SubscriptionTier, { priceId: string; unitAmount: number; currency: string }> = {} as any
    const tierCandidates: Record<SubscriptionTier, Stripe.Price[]> = {
      starter: [],
      advanced: [],
      pro: [],
    }

    for (const price of prices.data) {
      if (!price.recurring || price.type !== 'recurring') continue
      if (!price.metadata?.tier) continue

      const tier = price.metadata.tier as SubscriptionTier
      if (!VALID_TIERS.includes(tier)) continue
      if (price.unit_amount == null) continue
      tierCandidates[tier].push(price)
    }

    for (const tier of VALID_TIERS) {
      const candidates = tierCandidates[tier]
      if (!candidates.length) continue

      const monthly = candidates.filter(p => p.recurring?.interval === 'month')
      const pool = monthly.length ? monthly : candidates

      const preferred =
        pool.find(p => (p.metadata?.current || '').toString().toLowerCase() === 'true') ||
        pool.sort((a, b) => b.created - a.created)[0]

      tiers[tier] = {
        priceId: preferred.id,
        unitAmount: (preferred.unit_amount || 0) / 100,
        currency: preferred.currency.toUpperCase(),
      }
    }

    return NextResponse.json({ tiers })
  } catch (error) {
    console.error('Stripe price fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}
