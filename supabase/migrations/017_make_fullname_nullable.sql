-- Make full_name nullable to support onboarding flow
-- Users will set their name during onboarding after email verification

ALTER TABLE profiles
ALTER COLUMN full_name DROP NOT NULL;
