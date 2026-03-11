-- Analytics now runs in live-only mode (no analytics data persisted in Supabase).
-- Drop historical analytics storage and sync orchestration artifacts.

DROP TABLE IF EXISTS analytics_sync_jobs CASCADE;
DROP TABLE IF EXISTS analytics_monthly_flows CASCADE;
DROP TABLE IF EXISTS analytics_monthly_campaigns CASCADE;
DROP TABLE IF EXISTS analytics_daily_metrics CASCADE;
DROP TABLE IF EXISTS klaviyo_analytics_preferences CASCADE;

ALTER TABLE klaviyo_connections
  DROP COLUMN IF EXISTS analytics_synced_through,
  DROP COLUMN IF EXISTS discovered_metric_ids;
