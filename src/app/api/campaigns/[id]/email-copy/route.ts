import { generateEmailCopySuggestions } from '@/lib/ai/gemini'
import {
  buildFigmaRateLimitMessage,
  FigmaRateLimitError,
  figmaApiFetch,
} from '@/lib/figma'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const MAX_TEXT_NODES = 150
const MAX_TEXT_CHARS = 8_000

function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId: string } | null {
  const fileKeyMatch = figmaUrl.match(/\/design\/([^/]+)/)
  const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/)

  if (!fileKeyMatch || !nodeIdMatch) return null

  return {
    fileKey: fileKeyMatch[1],
    nodeId: decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ':'),
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function collectTextNodes(node: any, collected: string[] = []): string[] {
  if (!node || collected.length >= MAX_TEXT_NODES) {
    return collected
  }

  if (node.type === 'TEXT' && typeof node.characters === 'string') {
    const normalized = normalizeText(node.characters)
    if (normalized) {
      collected.push(normalized)
    }
  }

  if (!Array.isArray(node.children)) {
    return collected
  }

  for (const child of node.children) {
    if (collected.length >= MAX_TEXT_NODES) break
    collectTextNodes(child, collected)
  }

  return collected
}

function dedupeTextSnippets(textSnippets: string[]): string[] {
  const deduped: string[] = []
  const seen = new Set<string>()
  let totalChars = 0

  for (const snippet of textSnippets) {
    const normalized = normalizeText(snippet)
    if (!normalized) continue

    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    if (totalChars + normalized.length > MAX_TEXT_CHARS) break

    seen.add(key)
    deduped.push(normalized)
    totalChars += normalized.length
  }

  return deduped
}

async function getFigmaAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (!figmaConnection) {
    throw new Error('Figma not connected')
  }

  let figmaToken = figmaConnection.access_token
  const expiresAt = new Date(figmaConnection.expires_at)

  if (expiresAt > new Date() || !figmaConnection.refresh_token) {
    return figmaToken
  }

  const refreshResponse = await fetch('https://api.figma.com/v1/oauth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.FIGMA_CLIENT_ID!,
      client_secret: process.env.FIGMA_CLIENT_SECRET!,
      refresh_token: figmaConnection.refresh_token,
    }),
  })

  if (!refreshResponse.ok) {
    console.error('Failed to refresh Figma token:', await refreshResponse.text())
    throw new Error('Figma token expired. Please reconnect Figma.')
  }

  const tokens = await refreshResponse.json()
  figmaToken = tokens.access_token

  await supabase
    .from('figma_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || figmaConnection.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq('user_id', userId)

  return figmaToken
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json().catch(() => ({})) as { campaignName?: string }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('id, user_id, name, figma_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!campaign.figma_url) {
      return NextResponse.json({ error: 'No Figma design is linked to this campaign yet.' }, { status: 400 })
    }

    const parsedFigmaUrl = parseFigmaUrl(campaign.figma_url)
    if (!parsedFigmaUrl) {
      return NextResponse.json({ error: 'The saved Figma URL is missing a valid frame reference.' }, { status: 400 })
    }

    const figmaToken = await getFigmaAccessToken(supabase, user.id)
    const cooldownKey = `${user.id}:${parsedFigmaUrl.fileKey}`

    let nodesResponse: Response
    try {
      nodesResponse = await figmaApiFetch(
        `https://api.figma.com/v1/files/${parsedFigmaUrl.fileKey}/nodes?ids=${encodeURIComponent(parsedFigmaUrl.nodeId)}`,
        {
          accessToken: figmaToken,
          cooldownKey,
          max429Retries: 1,
          maxAutoRetryAfterSec: 20,
        }
      )
    } catch (error) {
      if (error instanceof FigmaRateLimitError) {
        return NextResponse.json(
          {
            error: buildFigmaRateLimitMessage(error.details),
            code: 'figma_rate_limited',
            retryAfterSec: error.details.retryAfterSec,
          },
          { status: 429 }
        )
      }

      throw error
    }

    if (!nodesResponse.ok) {
      const errorText = await nodesResponse.text()
      console.error('Figma nodes API error while generating email copy:', errorText)
      return NextResponse.json({ error: 'Failed to read the Figma frame.' }, { status: 500 })
    }

    const nodesData = await nodesResponse.json()
    const documentNode = nodesData.nodes?.[parsedFigmaUrl.nodeId]?.document

    if (!documentNode) {
      return NextResponse.json({ error: 'The selected Figma frame could not be found.' }, { status: 404 })
    }

    const textSnippets = dedupeTextSnippets(collectTextNodes(documentNode))

    if (textSnippets.length === 0) {
      return NextResponse.json(
        { error: 'No text layers were found in the selected Figma frame.' },
        { status: 400 }
      )
    }

    const result = await generateEmailCopySuggestions({
      campaignName: body.campaignName?.trim() || campaign.name,
      frameName: typeof documentNode.name === 'string' ? documentNode.name : null,
      textSnippets,
    })

    return NextResponse.json({
      subjectLine: result.subjectLine,
      previewText: result.previewText,
      model: result.model,
      frameName: typeof documentNode.name === 'string' ? documentNode.name : null,
      textNodeCount: textSnippets.length,
    })
  } catch (error) {
    console.error('Generate email copy error:', error)
    return NextResponse.json(
      { error: (error as Error)?.message || 'Failed to generate email copy.' },
      { status: 500 }
    )
  }
}
