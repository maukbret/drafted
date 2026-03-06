-- Normalized analytics tables for nightly sync
-- Replaces the JSONB-blob approach in klaviyo_analytics_cache

-- 1 row per connection per day
CREATE TABLE analytics_daily_metrics (
  id uuid default uuid_generate_v4() primary key,
  connection_id uuid references klaviyo_connections(id) on delete cascade not null,
  date date not null,
  total_revenue numeric(12,2) not null default 0,
  attributed_revenue numeric(12,2) not null default 0,
  subscribers integer not null default 0,
  unsubscribes integer not null default 0,
  unique(connection_id, date)
);

ALTER TABLE analytics_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own connection daily metrics"
  ON analytics_daily_metrics
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_analytics_daily_metrics_conn_date
  ON analytics_daily_metrics(connection_id, date);

-- 1 row per connection per campaign per month
CREATE TABLE analytics_monthly_campaigns (
  id uuid default uuid_generate_v4() primary key,
  connection_id uuid references klaviyo_connections(id) on delete cascade not null,
  month date not null, -- always YYYY-MM-01
  campaign_id text not null,
  campaign_name text not null default 'Unknown',
  revenue numeric(12,2) not null default 0,
  open_rate numeric(6,4) not null default 0,
  click_rate numeric(6,4) not null default 0,
  delivered_count integer not null default 0,
  unique(connection_id, month, campaign_id)
);

ALTER TABLE analytics_monthly_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own connection monthly campaigns"
  ON analytics_monthly_campaigns
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_analytics_monthly_campaigns_conn_month
  ON analytics_monthly_campaigns(connection_id, month);

-- 1 row per connection per flow per month
CREATE TABLE analytics_monthly_flows (
  id uuid default uuid_generate_v4() primary key,
  connection_id uuid references klaviyo_connections(id) on delete cascade not null,
  month date not null, -- always YYYY-MM-01
  flow_id text not null,
  flow_name text not null default 'Unknown',
  revenue numeric(12,2) not null default 0,
  open_rate numeric(6,4) not null default 0,
  click_rate numeric(6,4) not null default 0,
  delivered_count integer not null default 0,
  unique(connection_id, month, flow_id)
);

ALTER TABLE analytics_monthly_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own connection monthly flows"
  ON analytics_monthly_flows
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_analytics_monthly_flows_conn_month
  ON analytics_monthly_flows(connection_id, month);

-- Job queue for sync orchestration
CREATE TABLE analytics_sync_jobs (
  id uuid default uuid_generate_v4() primary key,
  connection_id uuid references klaviyo_connections(id) on delete cascade not null,
  month date not null, -- always YYYY-MM-01
  step text not null, -- 'daily-metrics', 'campaigns', 'flows'
  status text not null default 'pending', -- 'pending', 'running', 'completed', 'failed'
  triggered_by text not null default 'cron', -- 'cron', 'onboarding', 'manual'
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  unique(connection_id, month, step)
);

ALTER TABLE analytics_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own connection sync jobs"
  ON analytics_sync_jobs
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_analytics_sync_jobs_status
  ON analytics_sync_jobs(status, created_at);

-- Track how far back analytics have been synced for each connection
ALTER TABLE klaviyo_connections
  ADD COLUMN IF NOT EXISTS analytics_synced_through date;
