export const ONBOARDING_STEP_SLUGS = [
  'signup',
  'profile',
  'plan',
  'figma',
  'klaviyo',
] as const

export type OnboardingStepSlug = (typeof ONBOARDING_STEP_SLUGS)[number]

export type OnboardingStepKey = OnboardingStepSlug

export const STEP_SLUG_TO_NUMBER: Record<OnboardingStepSlug, number> = {
  signup: 1,
  profile: 2,
  plan: 3,
  figma: 4,
  klaviyo: 5,
}

export const STEP_NUMBER_TO_SLUG: Record<number, OnboardingStepSlug> = {
  1: 'signup',
  2: 'profile',
  3: 'plan',
  4: 'figma',
  5: 'klaviyo',
}

export function isOnboardingStepSlug(
  value: string
): value is OnboardingStepSlug {
  return (ONBOARDING_STEP_SLUGS as readonly string[]).includes(value)
}

export function contentMaxWidthForStep(
  step: OnboardingStepKey
): 'sm' | 'md' | '4xl' {
  if (step === 'plan') return '4xl'
  if (step === 'signup') return 'sm'
  return 'md'
}

/** Connection steps: fill the scroll region and vertically center the block. */
export function mainAlignForStep(step: OnboardingStepKey): 'center' | 'start' {
  if (step === 'figma' || step === 'klaviyo') return 'center'
  return 'start'
}
