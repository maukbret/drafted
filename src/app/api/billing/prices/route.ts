import { NextResponse } from 'next/server'
import { stripe, SubscriptionTier } from '@/lib/stripe'
import type Stripe from 'stripe'

const VALID_TIERS: SubscriptionTier[] = ['starter', 'advanced', 'pro']

export async function GET() {
  try {
    const products = await stripe.products.list({
      active: true,
      limit: 100,
      expand: ['data.default_price'],
    })

    const tiers: Record<
      SubscriptionTier,
      { priceId: string; unitAmount: number; currency: string; productId: string; name: string }
    > = {} as any

    for (const product of products.data) {
      const tier = product.metadata?.tier as SubscriptionTier | undefined
      if (!tier || !VALID_TIERS.includes(tier)) continue

      const defaultPrice = product.default_price as Stripe.Price | null
      if (!defaultPrice || !defaultPrice.recurring || defaultPrice.type !== 'recurring') continue
      if (defaultPrice.unit_amount == null) continue

      tiers[tier] = {
        priceId: defaultPrice.id,
        unitAmount: defaultPrice.unit_amount / 100,
        currency: defaultPrice.currency.toUpperCase(),
        productId: product.id,
        name: product.name,
      }
    }

    return NextResponse.json(
      { tiers },
      {
        headers: {
          'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
        },
      }
    )
  } catch (error) {
    console.error('Stripe price fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}
