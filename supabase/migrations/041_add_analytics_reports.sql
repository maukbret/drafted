-- Persist generated analytics report outputs (lightweight, one row per report).

CREATE TABLE analytics_reports (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id uuid REFERENCES klaviyo_connections(id) ON DELETE SET NULL,
  title text NOT NULL,
  account_label text NOT NULL,
  period_month text NOT NULL,
  compare_month text NOT NULL,
  include_list_growth boolean NOT NULL DEFAULT false,
  add_summary boolean NOT NULL DEFAULT true,
  include_action_items boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready')),
  analytics_data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_reports_user_created
  ON analytics_reports(user_id, created_at DESC);

ALTER TABLE analytics_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics reports"
  ON analytics_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics reports"
  ON analytics_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

