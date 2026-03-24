import { createClient } from '@/lib/supabase/server'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

const KLAVIYO_REVISION = '2026-01-15'

function klaviyoHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'revision': KLAVIYO_REVISION,
  }
}

/**
 * Render a Klaviyo template via the render API to get fully compiled HTML
 * (with all CSS rules, inline styles, and resolved content).
 */
async function renderTemplate(token: string, templateId: string): Promise<string> {
  const response = await fetch('https://a.klaviyo.com/api/template-render', {
    method: 'POST',
    headers: klaviyoHeaders(token),
    body: JSON.stringify({
      data: {
        type: 'template',
        id: templateId,
        attributes: { context: {} },
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('Template render error:', errText)
    throw new Error('Failed to render template')
  }

  const data = await response.json()
  return data.data?.attributes?.html || ''
}

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

    // Verify user owns this connection or is a team admin with access
    let { data: connection } = await supabase
      .from('klaviyo_connections')
      .select('id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      // Check if user is a team admin who shares a team with the connection owner
      const { data: sharedConnection } = await supabase
        .from('klaviyo_connections')
        .select('id, user_id')
        .eq('id', connectionId)
        .single()

      if (sharedConnection) {
        const { data: memberships } = await supabase
          .from('team_members')
          .select('team_id, role')
          .eq('user_id', user.id)

        const adminTeamIds = (memberships || [])
          .filter(m => m.role === 'admin')
          .map(m => m.team_id)

        if (adminTeamIds.length > 0) {
          const { data: ownerInTeam } = await supabase
            .from('team_members')
            .select('team_id')
            .eq('user_id', sharedConnection.user_id)
            .in('team_id', adminTeamIds)
            .maybeSingle()

          if (ownerInTeam) {
            connection = sharedConnection
          }
        }
      }
    }

    if (!connection) {
      return NextResponse.json({ error: 'Klaviyo connection not found' }, { status: 404 })
    }

    // Get valid token (refreshes automatically if needed)
    const klaviyoToken = await getValidKlaviyoToken(supabase, connectionId)

    if (!klaviyoToken) {
      return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect.' }, { status: 401 })
    }

    const headers = {
      'Authorization': `Bearer ${klaviyoToken}`,
      'Accept': 'application/json',
      'revision': KLAVIYO_REVISION,
    }

    // Get campaign details to find the template/message
    const campaignResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}?include=campaign-messages`, { headers })

    if (!campaignResponse.ok) {
      const errorText = await campaignResponse.text()
      console.error('Campaign fetch error:', errorText)
      return NextResponse.json({
        error: 'Failed to fetch campaign. Make sure the campaign URL is correct and belongs to this Klaviyo account.'
      }, { status: 400 })
    }

    const campaignData = await campaignResponse.json()

    // Get the message/template HTML
    const messageId = campaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id
    if (!messageId) {
      return NextResponse.json({
        error: 'Could not find email content for this campaign.'
      }, { status: 400 })
    }

    // Fetch the message to get the template ID
    const messageResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${messageId}`, { headers })

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error('Message fetch error:', errorText)
      return NextResponse.json({
        error: 'Failed to fetch email content.'
      }, { status: 400 })
    }

    const messageData = await messageResponse.json()

    // Find the template ID so we can render the compiled HTML
    const templateId = messageData.data?.relationships?.template?.data?.id

    let html = ''

    if (templateId) {
      // Render the template to get fully compiled HTML with all CSS
      try {
        html = await renderTemplate(klaviyoToken, templateId)
        console.log('Got rendered HTML from template, length:', html.length)
      } catch (err) {
        console.error('Template render failed, falling back to source HTML:', err)
      }
    }

    // Fallback: use the source HTML if render didn't work
    if (!html) {
      html = messageData.data?.attributes?.body?.html ||
             messageData.data?.attributes?.html ||
             messageData.data?.attributes?.content?.html ||
             messageData.data?.attributes?.definition?.content?.html ||
             ''

      if (!html && templateId) {
        const templateResponse = await fetch(`https://a.klaviyo.com/api/templates/${templateId}`, { headers })
        if (templateResponse.ok) {
          const templateData = await templateResponse.json()
          html = templateData.data?.attributes?.html || ''
          console.log('Fallback: got source HTML from template, length:', html.length)
        }
      }
    }

    if (!html) {
      return NextResponse.json({
        error: 'Could not extract email HTML from this campaign. The campaign may use a format we cannot parse.'
      }, { status: 400 })
    }

    // Parse the compiled HTML to extract sections
    const sections = parseEmailSections(html)

    // Extract CSS from <head> <style> tags — in compiled HTML this includes
    // all Klaviyo boilerplate rules (kl-row, kl-column, responsive breakpoints, etc.)
    const headCss = extractHeadCss(html)

    console.log('Parsed sections count:', sections.length, 'Head CSS length:', headCss.length)

    if (sections.length === 0) {
      return NextResponse.json({
        error: 'Could not parse email sections. The email format may not be supported.'
      }, { status: 400 })
    }

    return NextResponse.json({ sections, headCss })

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

function extractHeadCss(html: string): string {
  const $ = cheerio.load(html)
  const cssBlocks: string[] = []
  $('head style').each((_, el) => {
    const content = $(el).html()
    if (content) cssBlocks.push(content)
  })
  return cssBlocks.join('\n')
}

function parseEmailSections(html: string): EmailSection[] {
  const $ = cheerio.load(html)
  const sections: EmailSection[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables: any[] = []

  console.log('Starting to parse HTML for tables...')

  // Klaviyo emails are table-based. Find the main content container first.
  // Common patterns: center > table, body > table, or nested wrapper tables

  // Strategy 1: Look for tables inside center tags (most common Klaviyo pattern)
  const centerTables = $('center > table, center > div > table')
  if (centerTables.length > 0) {
    centerTables.each((_, el) => { tables.push(el) })
    console.log('Strategy 1 - tables in center tags:', tables.length)
  }

  // Strategy 2: If no center tags, look for top-level tables in body
  if (tables.length === 0) {
    const bodyTables = $('body > table, body > div > table')
    bodyTables.each((_, el) => { tables.push(el) })
    console.log('Strategy 2 - body tables:', tables.length)
  }

  // Strategy 3: If still nothing, find all tables and deduplicate
  if (tables.length === 0) {
    const allTables = $('table')
    console.log('Strategy 3 - all tables found:', allTables.length)

    // Only keep tables that have content and aren't deeply nested layout tables
    allTables.each((_, table) => {
      const text = $(table).text().trim()
      const hasContent = text.length > 5 || $(table).find('img').length > 0
      if (hasContent) {
        tables.push(table)
      }
    })
  }

  console.log('Total tables before dedup:', tables.length)

  // Deduplicate - remove tables that are children of other tables in the list
  const deduped = tables.filter((el, idx) => {
    for (let i = 0; i < tables.length; i++) {
      if (i !== idx && $.contains(tables[i], el)) {
        return false
      }
    }
    return true
  })

  console.log('Tables after dedup:', deduped.length)

  // Fallback: if only one top-level table is found, it's likely a wrapper
  // (e.g., Drafted-generated HTML). In that case, extract its immediate
  // descendant tables as sections.
  if (deduped.length === 1) {
    const wrapper = deduped[0]
    const descendantTables = $(wrapper).find('table')
    const extracted: any[] = []

    descendantTables.each((_, table) => {
      const text = $(table).text().trim()
      const hasContent = text.length > 5 || $(table).find('img').length > 0
      if (hasContent) {
        extracted.push(table)
      }
    })

    if (extracted.length > 0) {
      console.log('Wrapper table detected; extracted descendant tables:', extracted.length)
      deduped.length = 0
      extracted.forEach(t => deduped.push(t))
    }
  }

  // Convert to sections
  deduped.forEach((element, index) => {
    const outerHtml = $.html(element)
    const textContent = $(element).text().trim()

    // Create a text preview (first 150 chars)
    const preview = textContent.substring(0, 150).replace(/\s+/g, ' ').trim()

    sections.push({
      id: `section-${index}`,
      html: outerHtml,
      preview: preview || '(No text content - may contain images)',
      index,
    })
  })

  return sections
}
