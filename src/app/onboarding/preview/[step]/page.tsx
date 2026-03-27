import { notFound } from 'next/navigation'

import { isOnboardingPreviewEnabled } from '@/lib/onboarding-preview'
import { isOnboardingStepSlug } from '@/lib/onboarding-steps'

import { OnboardingPreviewContent } from './preview-content'

interface PageProps {
  params: Promise<{ step: string }>
}

export default async function OnboardingPreviewStepPage({ params }: PageProps) {
  if (!isOnboardingPreviewEnabled()) notFound()

  const { step } = await params
  if (!isOnboardingStepSlug(step)) notFound()

  return <OnboardingPreviewContent step={step} />
}
