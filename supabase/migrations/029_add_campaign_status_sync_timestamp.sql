-- Cache the last moment we checked a campaign status in Klaviyo.
-- This allows incremental sync without polling every campaign on every page load.

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS last_status_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaigns_last_status_synced_at
  ON campaigns(last_status_synced_at);
