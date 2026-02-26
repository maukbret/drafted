import { validateStoreUrl } from '@/lib/store-url'

// PKCE helper functions
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(Array.from(buffer).map(b => String.fromCharCode(b)).join(''))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

export function startFigmaOAuth() {
  const state = crypto.randomUUID()
  document.cookie = `figma_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_FIGMA_CLIENT_ID!,
    redirect_uri: process.env.NEXT_PUBLIC_FIGMA_REDIRECT_URI!,
    scope: 'file_content:read',
    state,
    response_type: 'code',
  })

  window.location.href = `https://www.figma.com/oauth?${params.toString()}`
}

export function startKlaviyoOAuth(accountName: string, storeUrl: string, isShared?: boolean): string | null {
  if (!accountName.trim()) {
    return 'Please enter an account name'
  }

  const validation = validateStoreUrl(storeUrl)
  if (!validation.valid) {
    return validation.error
  }

  document.cookie = `klaviyo_account_name=${encodeURIComponent(accountName.trim())}; path=/; max-age=600; SameSite=Lax`
  document.cookie = `klaviyo_store_url=${encodeURIComponent(validation.normalized)}; path=/; max-age=600; SameSite=Lax`
  if (isShared !== undefined) {
    document.cookie = `klaviyo_is_shared=${isShared ? '1' : '0'}; path=/; max-age=600; SameSite=Lax`
  }

  const codeVerifier = generateCodeVerifier()
  document.cookie = `klaviyo_code_verifier=${codeVerifier}; path=/; max-age=600; SameSite=Lax`

  generateCodeChallenge(codeVerifier).then((codeChallenge) => {
    const state = crypto.randomUUID()
    document.cookie = `klaviyo_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID!,
      redirect_uri: process.env.NEXT_PUBLIC_KLAVIYO_REDIRECT_URI!,
      scope: 'accounts:read images:write templates:read templates:write lists:read segments:read campaigns:write campaigns:read flows:read metrics:read forms:read',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    })

    window.location.href = `https://www.klaviyo.com/oauth/authorize?${params.toString()}`
  })

  return null // no error
}
