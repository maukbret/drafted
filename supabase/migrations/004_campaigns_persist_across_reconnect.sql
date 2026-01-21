-- Add klaviyo_account_id to campaigns for persistence across reconnections
ALTER TABLE campaigns ADD COLUMN klaviyo_account_id TEXT;

-- Populate klaviyo_account_id from existing connections
UPDATE campaigns c
SET klaviyo_account_id = kc.klaviyo_account_id
FROM klaviyo_connections kc
WHERE c.klaviyo_connection_id = kc.id;

-- Drop the existing foreign key constraint
ALTER TABLE campaigns DROP CONSTRAINT campaigns_klaviyo_connection_id_fkey;

-- Make klaviyo_connection_id nullable
ALTER TABLE campaigns ALTER COLUMN klaviyo_connection_id DROP NOT NULL;

-- Re-add foreign key with SET NULL instead of CASCADE
ALTER TABLE campaigns ADD CONSTRAINT campaigns_klaviyo_connection_id_fkey
  FOREIGN KEY (klaviyo_connection_id) REFERENCES klaviyo_connections(id) ON DELETE SET NULL;

-- Add index for klaviyo_account_id lookups
CREATE INDEX idx_campaigns_klaviyo_account_id ON campaigns(klaviyo_account_id);
