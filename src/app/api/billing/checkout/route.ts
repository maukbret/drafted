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

    // Get tier from request body
    const body = await request.json().catch(() => ({}))
    const tier = (body.tier as SubscriptionTier) || 'starter'

    // Validate tier
    if (!TIER_CONFIGS[tier]) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const tierConfig = TIER_CONFIGS[tier]

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
    const origin =
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      line_items: [
        {
          price: tierConfig.priceId,
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
      success_url: `${origin}/campaigns?checkout=success`,
      cancel_url: `${origin}/onboarding?step=plan&checkout=cancelled`,
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
