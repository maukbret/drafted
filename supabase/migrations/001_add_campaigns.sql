-- Campaigns table for email campaign management
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  klaviyo_connection_id UUID NOT NULL REFERENCES klaviyo_connections(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  preview_text TEXT,

  included_audiences JSONB DEFAULT '[]'::jsonb,
  excluded_audiences JSONB DEFAULT '[]'::jsonb,

  klaviyo_campaign_id TEXT,
  klaviyo_template_id TEXT,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'scheduled', 'sent', 'error')),
  scheduled_at TIMESTAMPTZ,
  wizard_step INTEGER DEFAULT 1,
  figma_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add campaign_id to projects table
ALTER TABLE projects ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- RLS policies for campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
