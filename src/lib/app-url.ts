const DEFAULT_DEV_APP_URL = 'http://localhost:3000'

export function getAppUrl(): string {
  const configuredUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '')
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEFAULT_DEV_APP_URL
  }

  throw new Error('APP_URL or NEXT_PUBLIC_APP_URL must be set in production')
}

export function createAppUrl(pathname: string): URL {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return new URL(normalizedPath, `${getAppUrl()}/`)
}
