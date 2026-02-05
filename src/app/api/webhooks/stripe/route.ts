import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe, getTierFromPriceId, SubscriptionTier } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Use service role for webhook handling (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id

        if (userId) {
          if (customerId) {
            await supabaseAdmin
              .from('stripe_customers')
              .upsert(
                { user_id: userId, stripe_customer_id: customerId },
                { onConflict: 'user_id' }
              )
          }

          // Mark subscription as selected in profile
          await supabaseAdmin
            .from('profiles')
            .update({ subscription_selected: true })
            .eq('id', userId)

          // Immediately upsert subscription so middleware can see it
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            await upsertSubscription(subscription, userId)
          }
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id

        if (!userId) {
          // Try to get user ID from customer
          const { data: customer } = await supabaseAdmin
            .from('stripe_customers')
            .select('user_id')
            .eq('stripe_customer_id', subscription.customer as string)
            .single()

          if (!customer) {
            console.error('No user found for subscription:', subscription.id)
            break
          }

          await upsertSubscription(subscription, customer.user_id)
        } else {
          await upsertSubscription(subscription, userId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = typeof invoice.parent?.subscription_details?.subscription === 'string'
          ? invoice.parent.subscription_details.subscription
          : invoice.parent?.subscription_details?.subscription?.id

        if (subscriptionId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId)
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

async function upsertSubscription(
  subscription: Stripe.Subscription,
  userId: string
) {
  // Get current period from the first item
  const currentPeriodStart = subscription.items.data[0]?.current_period_start
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end
  const priceId = subscription.items.data[0]?.price.id || null

  // Determine tier from price ID or metadata
  let priceTier: SubscriptionTier | null = null
  if (priceId) {
    priceTier = getTierFromPriceId(priceId)
  }
  // Fallback to metadata if available
  if (!priceTier && subscription.metadata?.tier) {
    priceTier = subscription.metadata.tier as SubscriptionTier
  }
  // Fallback to price metadata (useful when upgrading via Stripe Portal)
  if (!priceTier && priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId)
      const tierFromPrice = price.metadata?.tier
      if (tierFromPrice) {
        priceTier = tierFromPrice as SubscriptionTier
      }
    } catch (err) {
      console.error('Failed to retrieve Stripe price metadata:', err)
    }
  }

  const subscriptionData = {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer as string,
    status: subscription.status,
    price_id: priceId,
    price_tier: priceTier,
    current_period_start: currentPeriodStart
      ? new Date(currentPeriodStart * 1000).toISOString()
      : null,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    trial_start: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subscriptionData, {
      onConflict: 'user_id',
    })

  if (error) {
    console.error('Failed to upsert subscription:', error)
    throw error
  }
}
