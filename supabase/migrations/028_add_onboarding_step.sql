-- Add onboarding_step column to track multi-step onboarding progress
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 1;

-- Grandfather existing users who completed onboarding to step 5
UPDATE profiles SET onboarding_step = 5 WHERE onboarding_completed = true;
