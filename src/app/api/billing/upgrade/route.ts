import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/route'
import { stripe, TIER_CONFIGS, SubscriptionTier } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get target tier from request body
    const body = await request.json().catch(() => ({}))
    const targetTier = body.tier as SubscriptionTier

    // Validate tier
    if (!targetTier || !TIER_CONFIGS[targetTier]) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const tierConfig = TIER_CONFIGS[targetTier]

    // Get existing subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, price_tier')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .single()

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      )
    }

    // Check if trying to upgrade to same or lower tier
    const tierOrder: SubscriptionTier[] = ['starter', 'advanced', 'pro']
    const currentTierIndex = tierOrder.indexOf(subscription.price_tier as SubscriptionTier)
    const targetTierIndex = tierOrder.indexOf(targetTier)

    if (targetTierIndex <= currentTierIndex) {
      return NextResponse.json(
        { error: 'Cannot downgrade through this endpoint. Use the Stripe portal.' },
        { status: 400 }
      )
    }

    // Create a Checkout session for the upgrade
    const session = await stripe.checkout.sessions.create({
      customer: subscription.stripe_customer_id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: tierConfig.priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          tier: targetTier,
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?upgrade=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?upgrade=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        tier: targetTier,
        upgrade_from: subscription.price_tier,
      },
    })

    const response = NextResponse.json({ url: session.url })
    return applyCookies(response)
  } catch (error) {
    console.error('Upgrade error:', error)
    return NextResponse.json(
      { error: 'Failed to create upgrade session' },
      { status: 500 }
    )
  }
}
