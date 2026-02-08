-- Add slice_mode column to campaigns table
ALTER TABLE campaigns ADD COLUMN slice_mode boolean NOT NULL DEFAULT false;
