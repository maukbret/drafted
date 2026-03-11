ALTER TABLE analytics_reports
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS ai_insights jsonb,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analytics_reports_ai_status_check'
  ) THEN
    ALTER TABLE analytics_reports
      ADD CONSTRAINT analytics_reports_ai_status_check
      CHECK (ai_status IN ('idle', 'generating', 'ready', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_analytics_reports_ai_status
  ON analytics_reports(user_id, ai_status, created_at DESC);
