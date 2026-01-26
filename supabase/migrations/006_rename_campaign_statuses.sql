-- Rename campaign statuses: draft -> in_progress, ready -> klaviyo_draft

-- Drop the old check constraint
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

-- Migrate existing data
UPDATE campaigns SET status = 'in_progress' WHERE status = 'draft';
UPDATE campaigns SET status = 'klaviyo_draft' WHERE status = 'ready';

-- Add the new check constraint with updated values
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('in_progress', 'klaviyo_draft', 'scheduled', 'sent', 'error'));

-- Update the default value
ALTER TABLE campaigns ALTER COLUMN status SET DEFAULT 'in_progress';
