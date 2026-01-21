import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { JSDOM } from 'jsdom'

export async function POST(request: NextRequest) {
  try {
    const { previewUrl, connectionId } = await request.json()

    if (!previewUrl) {
      return NextResponse.json({ error: 'Preview URL is required' }, { status: 400 })
    }

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    // Extract campaign ID from URL
    // Format: https://www.klaviyo.com/campaign/CAMPAIGN_ID/web-view
    const campaignIdMatch = previewUrl.match(/\/campaign\/([A-Za-z0-9]+)/)
    if (!campaignIdMatch) {
      return NextResponse.json({
        error: 'Invalid URL. Please provide a Klaviyo campaign URL (e.g., https://www.klaviyo.com/campaign/.../web-view)'
      }, { status: 400 })
    }

    const campaignId = campaignIdMatch[1]
    console.log('Extracted campaign ID:', campaignId)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Klaviyo connection to use their API
    const { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Klaviyo connection not found' }, { status: 404 })
    }

    // Check if token is expired and refresh if needed
    let klaviyoToken = connection.access_token
    const expiresAt = new Date(connection.expires_at)
    const now = new Date()

    if (expiresAt <= now && connection.refresh_token) {
      const refreshResponse = await fetch('https://a.klaviyo.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connection.refresh_token,
          client_id: process.env.KLAVIYO_CLIENT_ID!,
          client_secret: process.env.KLAVIYO_CLIENT_SECRET!,
        }),
      })

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json()
        klaviyoToken = tokens.access_token

        await supabase
          .from('klaviyo_connections')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || connection.refresh_token,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('id', connectionId)
      } else {
        return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect.' }, { status: 401 })
      }
    }

    // Get campaign details to find the template/message
    const campaignResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}?include=campaign-messages`, {
      headers: {
        'Authorization': `Bearer ${klaviyoToken}`,
        'Accept': 'application/json',
        'revision': '2024-10-15',
      },
    })

    if (!campaignResponse.ok) {
      const errorText = await campaignResponse.text()
      console.error('Campaign fetch error:', errorText)
      return NextResponse.json({
        error: 'Failed to fetch campaign. Make sure the campaign URL is correct and belongs to this Klaviyo account.'
      }, { status: 400 })
    }

    const campaignData = await campaignResponse.json()
    console.log('Campaign data:', JSON.stringify(campaignData, null, 2).substring(0, 1000))

    // Get the message/template HTML
    const messageId = campaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id
    if (!messageId) {
      return NextResponse.json({
        error: 'Could not find email content for this campaign.'
      }, { status: 400 })
    }

    // Fetch the message content
    const messageResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${messageId}`, {
      headers: {
        'Authorization': `Bearer ${klaviyoToken}`,
        'Accept': 'application/json',
        'revision': '2024-10-15',
      },
    })

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error('Message fetch error:', errorText)
      return NextResponse.json({
        error: 'Failed to fetch email content.'
      }, { status: 400 })
    }

    const messageData = await messageResponse.json()
    console.log('Message data keys:', Object.keys(messageData.data?.attributes || {}))

    // Try to get the HTML content - it might be in different places
    let html = messageData.data?.attributes?.body?.html ||
               messageData.data?.attributes?.html ||
               messageData.data?.attributes?.content?.html ||
               ''

    // If no HTML, try to get it from the template
    if (!html) {
      const templateId = messageData.data?.relationships?.template?.data?.id
      if (templateId) {
        const templateResponse = await fetch(`https://a.klaviyo.com/api/templates/${templateId}`, {
          headers: {
            'Authorization': `Bearer ${klaviyoToken}`,
            'Accept': 'application/json',
            'revision': '2024-10-15',
          },
        })

        if (templateResponse.ok) {
          const templateData = await templateResponse.json()
          html = templateData.data?.attributes?.html || ''
          console.log('Got HTML from template, length:', html.length)
        }
      }
    }

    if (!html) {
      console.log('Full message data:', JSON.stringify(messageData, null, 2))
      return NextResponse.json({
        error: 'Could not extract email HTML from this campaign. The campaign may use a format we cannot parse.'
      }, { status: 400 })
    }

    console.log('Fetched HTML length:', html.length)

    // Parse the HTML to extract sections
    const sections = parseEmailSections(html)

    console.log('Parsed sections count:', sections.length)

    if (sections.length === 0) {
      return NextResponse.json({
        error: 'Could not parse email sections. The email format may not be supported.'
      }, { status: 400 })
    }

    return NextResponse.json({ sections })

  } catch (err) {
    console.error('Footer fetch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface EmailSection {
  id: string
  html: string
  preview: string // Truncated text preview
  index: number
}

function parseEmailSections(html: string): EmailSection[] {
  const dom = new JSDOM(html)
  const document = dom.window.document

  const sections: EmailSection[] = []
  const tables: Element[] = []

  console.log('Starting to parse HTML for tables...')

  // Klaviyo emails are table-based. Find the main content container first.
  // Common patterns: center > table, body > table, or nested wrapper tables

  // Strategy 1: Look for tables inside center tags (most common Klaviyo pattern)
  const centerTags = document.querySelectorAll('center')
  if (centerTags.length > 0) {
    centerTags.forEach(center => {
      // Get direct child tables or tables inside a wrapper div
      const directTables = center.querySelectorAll(':scope > table, :scope > div > table')
      directTables.forEach(t => tables.push(t))
    })
    console.log('Strategy 1 - tables in center tags:', tables.length)
  }

  // Strategy 2: If no center tags, look for top-level tables in body
  if (tables.length === 0) {
    const bodyTables = document.querySelectorAll('body > table, body > div > table')
    bodyTables.forEach(t => tables.push(t))
    console.log('Strategy 2 - body tables:', tables.length)
  }

  // Strategy 3: If still nothing, find all tables and deduplicate
  if (tables.length === 0) {
    const allTables = document.querySelectorAll('table')
    console.log('Strategy 3 - all tables found:', allTables.length)

    // Only keep tables that have content and aren't deeply nested layout tables
    allTables.forEach(table => {
      const text = table.textContent?.trim() || ''
      const hasContent = text.length > 5 || table.querySelector('img')
      if (hasContent) {
        tables.push(table)
      }
    })
  }

  console.log('Total tables before dedup:', tables.length)

  // Deduplicate - remove tables that are children of other tables in the list
  const deduped = tables.filter((el, idx) => {
    for (let i = 0; i < tables.length; i++) {
      if (i !== idx && tables[i].contains(el) && tables[i] !== el) {
        return false
      }
    }
    return true
  })

  console.log('Tables after dedup:', deduped.length)

  // Convert to sections
  deduped.forEach((element, index) => {
    const outerHtml = element.outerHTML
    const textContent = element.textContent?.trim() || ''

    // Create a text preview (first 150 chars)
    const preview = textContent.substring(0, 150).replace(/\s+/g, ' ').trim()

    sections.push({
      id: `table-${index}`,
      html: outerHtml,
      preview: preview || '(No text content - may contain images)',
      index,
    })
  })

  return sections
}
