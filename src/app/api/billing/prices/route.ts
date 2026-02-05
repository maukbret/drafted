import { NextResponse } from 'next/server'
import { stripe, SubscriptionTier } from '@/lib/stripe'

const VALID_TIERS: SubscriptionTier[] = ['starter', 'advanced', 'pro']

export async function GET() {
  try {
    const prices = await stripe.prices.list({
      active: true,
      limit: 100,
      expand: ['data.product'],
    })

    const tiers: Record<SubscriptionTier, { priceId: string; unitAmount: number; currency: string }> = {} as any

    for (const price of prices.data) {
      if (!price.recurring || price.type !== 'recurring') continue
      if (!price.metadata?.tier) continue

      const tier = price.metadata.tier as SubscriptionTier
      if (!VALID_TIERS.includes(tier)) continue
      if (price.unit_amount == null) continue

      const isMonthly = price.recurring?.interval === 'month'
      if (!tiers[tier] || isMonthly) {
        tiers[tier] = {
          priceId: price.id,
          unitAmount: price.unit_amount / 100,
          currency: price.currency.toUpperCase(),
        }
      }
    }

    return NextResponse.json({ tiers })
  } catch (error) {
    console.error('Stripe price fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}
