-- Add onboarding_completed field to profiles table
-- This ensures all new users complete their profile setup before accessing the app

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Set existing users as having completed onboarding (they already have profiles)
UPDATE profiles
SET onboarding_completed = TRUE
WHERE full_name IS NOT NULL AND full_name != '';

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON profiles(onboarding_completed);
