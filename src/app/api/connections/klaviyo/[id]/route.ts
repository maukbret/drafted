import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { validateStoreUrl } from '@/lib/store-url'

async function getEditableOwnerIds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const ownerIds = new Set<string>([userId])

  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .single()

  if (membership?.role === 'admin') {
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', membership.team_id)
      .eq('role', 'admin')

    adminMembers?.forEach((member) => ownerIds.add(member.user_id))
  }

  return [...ownerIds]
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { accountName?: string; storeUrl?: string; isShared?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const accountName = body.accountName?.trim() || ''
  if (!accountName) {
    return NextResponse.json({ error: 'Account name is required' }, { status: 400 })
  }

  const storeUrlValidation = validateStoreUrl(body.storeUrl || '')
  if (!storeUrlValidation.valid) {
    return NextResponse.json({ error: storeUrlValidation.error }, { status: 400 })
  }

  const editableOwnerIds = await getEditableOwnerIds(supabase, user.id)

  const updateData: Record<string, unknown> = {
    account_name: accountName,
    store_url: storeUrlValidation.normalized,
  }

  if (typeof body.isShared === 'boolean') {
    updateData.is_shared = body.isShared
  }

  const { data: connection, error } = await supabase
    .from('klaviyo_connections')
    .update(updateData)
    .eq('id', id)
    .in('user_id', editableOwnerIds)
    .select('id, account_name, store_url, is_shared')
    .maybeSingle()

  if (error) {
    console.error('Update error:', error)
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 })
  }

  if (!connection) {
    return NextResponse.json({ error: 'Not authorized to edit this connection' }, { status: 403 })
  }

  return NextResponse.json({ connection })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('klaviyo_connections')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
