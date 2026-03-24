-- Expand default audiences to support up to 3 named presets per user + account
ALTER TABLE klaviyo_default_audiences
  ADD COLUMN preset_name TEXT NOT NULL DEFAULT 'Default';

-- Drop old one-per-account constraint
ALTER TABLE klaviyo_default_audiences
  DROP CONSTRAINT klaviyo_default_audiences_user_id_klaviyo_account_id_key;

-- New constraint: unique name per user + account
ALTER TABLE klaviyo_default_audiences
  ADD CONSTRAINT klaviyo_default_audiences_user_account_name_key
    UNIQUE(user_id, klaviyo_account_id, preset_name);

-- Update the index to include preset_name
DROP INDEX IF EXISTS idx_klaviyo_default_audiences_user_account;
CREATE INDEX idx_klaviyo_default_audiences_user_account
  ON klaviyo_default_audiences(user_id, klaviyo_account_id);
