import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createAppUrl } from '@/lib/app-url'

export async function GET() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(createAppUrl('/login'))
}

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(createAppUrl('/login'))
}
