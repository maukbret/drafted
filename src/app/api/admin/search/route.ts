import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/feature-access'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
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

    const [profileResult, campaignCountResult, reportCountResult, subscriptionResult] = await Promise.all([
      service.from('profiles').select('id, full_name, created_at').eq('id', userId).single(),
      service.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      service.from('analytics_reports').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      service.from('subscriptions').select('price_tier, status, created_at').eq('user_id', userId).single(),
    ])

    return NextResponse.json({
      id: userId,
      email: targetUser.email,
      full_name: profileResult.data?.full_name ?? null,
      created_at: profileResult.data?.created_at ?? targetUser.created_at,
      campaigns: campaignCountResult.count ?? 0,
      reports: reportCountResult.count ?? 0,
      plan: subscriptionResult.data?.price_tier ?? null,
      subscription_status: subscriptionResult.data?.status ?? null,
      last_sign_in: targetUser.last_sign_in_at ?? null,
    })
  } catch (err) {
    console.error('Admin search error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
