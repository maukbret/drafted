export type FeatureKey = 'analytics' | 'reports' | 'productFeed'

const LEGACY_ALLOWED_USER_ID = '72e77673-28bc-4b99-9ce6-da239b50cd4c'

const FEATURE_CONFIG: Record<FeatureKey, {
  enabledEnv: string
  allowedUsersEnv: string
  defaultAllowedUsers: string[]
}> = {
  analytics: {
    enabledEnv: 'FEATURE_ANALYTICS_ENABLED',
    allowedUsersEnv: 'FEATURE_ANALYTICS_ALLOWED_USER_IDS',
    defaultAllowedUsers: [LEGACY_ALLOWED_USER_ID],
  },
  reports: {
    enabledEnv: 'FEATURE_REPORTS_ENABLED',
    allowedUsersEnv: 'FEATURE_REPORTS_ALLOWED_USER_IDS',
    defaultAllowedUsers: [LEGACY_ALLOWED_USER_ID],
  },
  productFeed: {
    enabledEnv: 'FEATURE_PRODUCT_FEED_ENABLED',
    allowedUsersEnv: 'FEATURE_PRODUCT_FEED_ALLOWED_USER_IDS',
    defaultAllowedUsers: [LEGACY_ALLOWED_USER_ID],
  },
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

function parseBoolean(rawValue: string | undefined): boolean | null {
  if (rawValue === undefined) return null
  const value = rawValue.trim().toLowerCase()
  if (TRUE_VALUES.has(value)) return true
  if (FALSE_VALUES.has(value)) return false
  return null
}

function parseUserIdList(rawValue: string | undefined): Set<string> {
  if (!rawValue) return new Set()
  return new Set(
    rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function isFeatureGloballyEnabled(feature: FeatureKey): boolean {
  const parsed = parseBoolean(process.env[FEATURE_CONFIG[feature].enabledEnv])
  return parsed === true
}

function getFeatureAllowlist(feature: FeatureKey): Set<string> {
  const config = FEATURE_CONFIG[feature]
  const rawAllowlist = process.env[config.allowedUsersEnv]
  if (rawAllowlist !== undefined) {
    return parseUserIdList(rawAllowlist)
  }
  return new Set(config.defaultAllowedUsers)
}

export function canAccessFeature(feature: FeatureKey, userId?: string | null): boolean {
  if (isFeatureGloballyEnabled(feature)) return true
  if (!userId) return false
  return getFeatureAllowlist(feature).has(userId)
}

export function canAccessAnalytics(userId?: string | null): boolean {
  return canAccessFeature('analytics', userId)
}

export function canAccessReports(userId?: string | null): boolean {
  return canAccessFeature('reports', userId)
}

export function canAccessProductFeed(userId?: string | null): boolean {
  return canAccessFeature('productFeed', userId)
}
