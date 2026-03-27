import { notFound, redirect } from 'next/navigation'

import { isOnboardingPreviewEnabled } from '@/lib/onboarding-preview'

export default function OnboardingPreviewIndexPage() {
  if (!isOnboardingPreviewEnabled()) notFound()
  redirect('/onboarding/preview/signup')
}
