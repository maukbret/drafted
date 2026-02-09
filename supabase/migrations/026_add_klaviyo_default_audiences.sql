-- Store default include/exclude audiences per user + Klaviyo account
CREATE TABLE IF NOT EXISTS klaviyo_default_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  klaviyo_account_id TEXT NOT NULL,
  included_audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluded_audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, klaviyo_account_id)
);

ALTER TABLE klaviyo_default_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own default audiences"
  ON klaviyo_default_audiences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own default audiences"
  ON klaviyo_default_audiences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own default audiences"
  ON klaviyo_default_audiences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own default audiences"
  ON klaviyo_default_audiences FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Team members can view team default audiences"
  ON klaviyo_default_audiences FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_team_admin_ids()));

CREATE INDEX IF NOT EXISTS idx_klaviyo_default_audiences_user_account
  ON klaviyo_default_audiences(user_id, klaviyo_account_id);

DROP TRIGGER IF EXISTS update_klaviyo_default_audiences_updated_at ON klaviyo_default_audiences;
CREATE TRIGGER update_klaviyo_default_audiences_updated_at
  BEFORE UPDATE ON klaviyo_default_audiences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
