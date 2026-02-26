import { SupabaseClient } from '@supabase/supabase-js'

// Simple in-memory lock to prevent concurrent token refreshes for the same connection
const refreshLocks = new Map<string, Promise<string | null>>()

// Buffer time before expiry to trigger refresh (5 minutes)
const REFRESH_BUFFER_MS = 5 * 60 * 1000

interface KlaviyoConnection {
  id: string
  access_token: string
  refresh_token: string | null
  expires_at: string
}

interface TokenRefreshResult {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/**
 * Gets a valid Klaviyo access token for a connection, refreshing if needed.
 * Handles race conditions when multiple requests need the same token.
 *
 * @param supabase - Supabase client instance
 * @param connectionId - The Klaviyo connection ID
 * @returns Valid access token or null if refresh failed
 */
export async function getValidKlaviyoToken(
  supabase: SupabaseClient,
  connectionId: string
): Promise<string | null> {
  // Check if there's already a refresh in progress for this connection
  const existingRefresh = refreshLocks.get(connectionId)
  if (existingRefresh) {
    return existingRefresh
  }

  // Create a new refresh promise
  const refreshPromise = refreshTokenIfNeeded(supabase, connectionId)
  refreshLocks.set(connectionId, refreshPromise)

  try {
    const token = await refreshPromise
    return token
  } finally {
    // Clean up the lock after completion
    refreshLocks.delete(connectionId)
  }
}

async function refreshTokenIfNeeded(
  supabase: SupabaseClient,
  connectionId: string
): Promise<string | null> {
  // Fetch the connection
  const { data: connection, error } = await supabase
    .from('klaviyo_connections')
    .select('id, access_token, refresh_token, expires_at')
    .eq('id', connectionId)
    .single()

  if (error || !connection) {
    console.error('[Klaviyo] Failed to fetch connection:', error)
    return null
  }

  const expiresAt = new Date(connection.expires_at)
  const now = new Date()
  const timeUntilExpiry = expiresAt.getTime() - now.getTime()

  // If token is still valid and not expiring soon, return it
  if (timeUntilExpiry > REFRESH_BUFFER_MS) {
    return connection.access_token
  }

  // Token is expired or expiring soon - refresh it
  console.log('[Klaviyo] Token expired or expiring soon, attempting refresh...')

  if (!connection.refresh_token) {
    console.error('[Klaviyo] No refresh token available for connection:', connectionId)
    return null
  }

  try {
    const newTokens = await refreshKlaviyoToken(connection.refresh_token)

    if (!newTokens) {
      console.error('[Klaviyo] Refresh returned null')
      return null
    }

    console.log('[Klaviyo] Token refreshed successfully, new expires_in:', newTokens.expires_in)

    // Update the database with new tokens
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
    const { error: updateError } = await supabase
      .from('klaviyo_connections')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || connection.refresh_token,
        expires_at: newExpiresAt,
      })
      .eq('id', connectionId)

    if (updateError) {
      console.error('[Klaviyo] Failed to update tokens in database:', updateError)
      // Still return the new token since refresh succeeded
    } else {
      console.log('[Klaviyo] Database updated with new tokens, expires_at:', newExpiresAt)
    }

    return newTokens.access_token
  } catch (err) {
    console.error('[Klaviyo] Failed to refresh token:', err)
    return null
  }
}

async function refreshKlaviyoToken(refreshToken: string): Promise<TokenRefreshResult | null> {
  // Fall back to NEXT_PUBLIC_ variant for client ID (they should be the same value)
  const clientId = process.env.KLAVIYO_CLIENT_ID || process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID
  const clientSecret = process.env.KLAVIYO_CLIENT_SECRET

  console.log('[Klaviyo] Attempting token refresh...')
  console.log('[Klaviyo] Client ID present:', !!clientId)
  console.log('[Klaviyo] Client Secret present:', !!clientSecret)

  if (!clientId || !clientSecret) {
    console.error('[Klaviyo] Missing client credentials for token refresh')
    return null
  }

  // Use Basic Auth header (same as initial token exchange)
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://a.klaviyo.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Klaviyo] Token refresh failed:', response.status, errorText)
    return null
  }

  const tokens = await response.json()
  console.log('[Klaviyo] Refresh successful, got new access_token and refresh_token:', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiresIn: tokens.expires_in,
  })

  return tokens
}

/**
 * Makes an authenticated request to the Klaviyo API.
 * Automatically handles token refresh if needed.
 *
 * @param supabase - Supabase client instance
 * @param connectionId - The Klaviyo connection ID
 * @param endpoint - Klaviyo API endpoint (e.g., '/api/accounts/')
 * @param options - Fetch options (method, body, etc.)
 * @returns Fetch response or null if authentication failed
 */
export async function klaviyoFetch(
  supabase: SupabaseClient,
  connectionId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const token = await getValidKlaviyoToken(supabase, connectionId)

  if (!token) {
    return null
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://a.klaviyo.com${endpoint}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'revision': '2024-10-15',
        ...options.headers,
      },
    })

    if (response.status === 401) {
      console.error('[Klaviyo] 401 after token refresh — connection may need re-authorization')
    }

    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[Klaviyo] Request timed out after 30s:', endpoint)
      return null
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
