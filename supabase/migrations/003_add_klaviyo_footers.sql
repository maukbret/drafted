-- Add klaviyo_account_id to klaviyo_connections for persistence across reconnects
ALTER TABLE klaviyo_connections
ADD COLUMN IF NOT EXISTS klaviyo_account_id TEXT;

-- Create klaviyo_footers table
CREATE TABLE IF NOT EXISTS klaviyo_footers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  klaviyo_account_id TEXT NOT NULL,
  footer_html TEXT NOT NULL,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one footer per user per Klaviyo account
  UNIQUE(user_id, klaviyo_account_id)
);

-- Enable RLS
ALTER TABLE klaviyo_footers ENABLE ROW LEVEL SECURITY;

-- RLS policies for klaviyo_footers
CREATE POLICY "Users can view their own footers"
  ON klaviyo_footers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own footers"
  ON klaviyo_footers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own footers"
  ON klaviyo_footers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own footers"
  ON klaviyo_footers FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_klaviyo_footers_user_account
  ON klaviyo_footers(user_id, klaviyo_account_id);
