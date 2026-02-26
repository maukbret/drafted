-- Cache discovered Klaviyo metric IDs on the connection so they don't need
-- to be re-fetched (via paginated /api/metrics/) on every analytics refresh.
-- The metric IDs for standard events (Placed Order, etc.) are stable per account.
ALTER TABLE klaviyo_connections ADD COLUMN IF NOT EXISTS discovered_metric_ids jsonb;
