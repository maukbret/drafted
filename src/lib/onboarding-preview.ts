/**
 * Static onboarding UI preview at `/onboarding/preview/[step]`.
 * Enabled in development, or when ALLOW_ONBOARDING_PREVIEW=true (e.g. staging).
 */
export function isOnboardingPreviewEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true
  return process.env.ALLOW_ONBOARDING_PREVIEW === 'true'
}
