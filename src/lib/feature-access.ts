export type FeatureKey = 'reports'

const FEATURE_CONFIG: Record<FeatureKey, {
  enabledEnv: string
  allowedUsersEnv: string
}> = {
  reports: {
    enabledEnv: 'FEATURE_REPORTS_ENABLED',
    allowedUsersEnv: 'FEATURE_REPORTS_ALLOWED_USER_IDS',
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
  return parseUserIdList(process.env[config.allowedUsersEnv])
}

function getAdminAllowlist(): Set<string> {
  return parseUserIdList(process.env.ADMIN_USER_IDS)
}

export function canAccessFeature(feature: FeatureKey, userId?: string | null): boolean {
  if (isFeatureGloballyEnabled(feature)) return true
  if (!userId) return false
  return getFeatureAllowlist(feature).has(userId)
}

export function canAccessReports(userId?: string | null): boolean {
  return canAccessFeature('reports', userId)
}

export function isAdmin(userId?: string | null): boolean {
  if (!userId) return false
  return getAdminAllowlist().has(userId)
}
