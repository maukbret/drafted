-- Add subscription_selected column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_selected boolean DEFAULT false;

-- Grandfather existing users who have completed onboarding
-- They will still need to subscribe, but this marks their intent to do so
UPDATE profiles SET subscription_selected = true WHERE onboarding_completed = true;

-- Create index for subscription_selected
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_selected ON profiles(subscription_selected);
