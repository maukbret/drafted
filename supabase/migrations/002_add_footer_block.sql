-- Add footer_block_id column to campaigns for Universal Content footer selection
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'footer_block_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN footer_block_id TEXT;
  END IF;
END $$;
