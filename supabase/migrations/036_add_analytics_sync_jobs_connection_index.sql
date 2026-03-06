-- Speed up history/status queries scoped by connection and month.
CREATE INDEX IF NOT EXISTS idx_analytics_sync_jobs_connection_month
  ON analytics_sync_jobs(connection_id, month, step);
