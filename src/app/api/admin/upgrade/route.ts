import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/feature-access'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { email, tier } = body as { email: string; tier: string }

    if (!email || !['starter', 'advanced', 'pro'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid email or tier' }, { status: 400 })
    }

    const service = createServiceClient()

    // Find user by email
    const { data: { users }, error: listError } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
    }

    const targetUser = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userId = targetUser.id

    // Check if subscription row already exists
    const { data: existingSub } = await service
      .from('subscriptions')
      .select('id, stripe_subscription_id, stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await service
        .from('subscriptions')
        .update({ status: 'active', price_tier: tier })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Subscription update error:', updateError)
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
      }
    } else {
      // Insert new subscription with placeholder stripe IDs
      const { error: insertError } = await service
        .from('subscriptions')
        .insert({
          user_id: userId,
          stripe_subscription_id: `manual_${userId}`,
          stripe_customer_id: `manual_${userId}`,
          status: 'active',
          price_tier: tier,
        })

      if (insertError) {
        console.error('Subscription insert error:', insertError)
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
      }
    }

    // Set subscription_selected on profile
    await service
      .from('profiles')
      .update({ subscription_selected: true })
      .eq('id', userId)

    return NextResponse.json({ success: true, userId, email, tier })
  } catch (err) {
    console.error('Admin upgrade error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
