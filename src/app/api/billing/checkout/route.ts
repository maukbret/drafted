import { NextRequest, NextResponse } from 'next/server'
import { createAppUrl } from '@/lib/app-url'
import { createRouteHandlerClient } from '@/lib/supabase/route'
import { getTierFromPriceId, stripe, TIER_CONFIGS, SubscriptionTier } from '@/lib/stripe'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tier/price from request body
    const body = await request.json().catch(() => ({}))
    const requestedTier = body.tier as SubscriptionTier | undefined
    const requestedPriceId = typeof body.priceId === 'string' ? body.priceId : null

    let tier: SubscriptionTier | null = requestedTier || null
    let priceIdToUse: string | null = null

    if (requestedPriceId) {
      let price: Stripe.Price | null = null
      try {
        price = await stripe.prices.retrieve(requestedPriceId)
      } catch (err) {
        console.error('Invalid Stripe price:', err)
        return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
      }

      if (!price.active || price.type !== 'recurring') {
        return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
      }

      let tierFromStripe: SubscriptionTier | null =
        getTierFromPriceId(requestedPriceId)
        || (price.metadata?.tier || null) as SubscriptionTier | null

      if (!tierFromStripe && price.product) {
        try {
          const productId = typeof price.product === 'string' ? price.product : price.product.id
          const product = await stripe.products.retrieve(productId)
          tierFromStripe = (product.metadata?.tier || null) as SubscriptionTier | null
        } catch (err) {
          console.error('Failed to retrieve Stripe product:', err)
        }
      }

      if (tierFromStripe) {
        if (requestedTier && tierFromStripe !== requestedTier) {
          return NextResponse.json({ error: 'Tier mismatch' }, { status: 400 })
        }
        tier = tierFromStripe
      }

      const allowedPriceIds = new Set(
        Object.values(TIER_CONFIGS).map((config) => config.priceId)
      )

      if (!allowedPriceIds.has(requestedPriceId)) {
        return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
      }

      priceIdToUse = requestedPriceId
    }

    if (!tier) {
      tier = 'starter'
    }

    // Validate tier
    if (!TIER_CONFIGS[tier]) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const tierConfig = TIER_CONFIGS[tier]
    if (!priceIdToUse) {
      priceIdToUse = tierConfig.priceId
    }

    // Get or create Stripe customer
    let stripeCustomerId: string

    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (existingCustomer) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })

      // Store the mapping
      const { error: insertError } = await supabase.from('stripe_customers').insert({
        user_id: user.id,
        stripe_customer_id: customer.id,
      })
      if (insertError) {
        console.error('Failed to store stripe customer mapping:', insertError)
      }

      stripeCustomerId = customer.id
    }

    // Create Checkout session (no trial, immediate payment)
    // Check if user is still onboarding to determine success redirect
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    const successUrl = profile?.onboarding_completed
      ? createAppUrl('/campaigns?checkout=success').toString()
      : createAppUrl('/onboarding?step=figma&checkout=success').toString()

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      line_items: [
        {
          price: priceIdToUse,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          tier: tier,
        },
      },
      success_url: successUrl,
      cancel_url: createAppUrl('/onboarding?step=plan&checkout=cancelled').toString(),
      metadata: {
        supabase_user_id: user.id,
        tier: tier,
      },
    })

    const response = NextResponse.json({ url: session.url })
    return applyCookies(response)
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
