-- Allow storing cancelled campaigns synced from Klaviyo

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('in_progress', 'klaviyo_draft', 'scheduled', 'cancelled', 'sent', 'error'));
