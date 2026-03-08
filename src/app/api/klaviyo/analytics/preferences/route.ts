import { createClient } from '@/lib/supabase/server'
import { analyticsPausedResponse, isAnalyticsPaused } from '@/lib/analytics-feature'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    if (isAnalyticsPaused()) {
      return NextResponse.json(analyticsPausedResponse(), { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: prefs } = await supabase
      .from('klaviyo_analytics_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .single()

    return NextResponse.json({ preferences: prefs || null })
  } catch (err) {
    console.error('Analytics preferences GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isAnalyticsPaused()) {
      return NextResponse.json(analyticsPausedResponse(), { status: 503 })
    }

    const body = await request.json()
    const { connectionId, selectedListId, selectedListName, selectedFormId, selectedFormName } = body

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('klaviyo_analytics_preferences')
      .upsert({
        user_id: user.id,
        connection_id: connectionId,
        selected_list_id: selectedListId || null,
        selected_list_name: selectedListName || null,
        selected_form_id: selectedFormId || null,
        selected_form_name: selectedFormName || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,connection_id' })

    if (error) {
      console.error('Failed to save analytics preferences:', error)
      return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Analytics preferences POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
