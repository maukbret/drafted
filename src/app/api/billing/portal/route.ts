import { NextRequest, NextResponse } from 'next/server'
import { createAppUrl } from '@/lib/app-url'
import { createRouteHandlerClient } from '@/lib/supabase/route'
import { stripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Stripe customer ID
    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (!customer) {
      return NextResponse.json(
        { error: 'No billing account found' },
        { status: 404 }
      )
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: createAppUrl('/billing').toString(),
    })

    const response = NextResponse.json({ url: session.url })
    return applyCookies(response)
  } catch (error) {
    console.error('Portal error:', error)
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
