ALTER TABLE analytics_reports
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS compare_start date,
  ADD COLUMN IF NOT EXISTS compare_end date;

UPDATE analytics_reports
SET
  period_start = COALESCE(
    period_start,
    CASE
      WHEN period_month ~ '^\d{4}-\d{2}$' THEN to_date(period_month || '-01', 'YYYY-MM-DD')
      ELSE created_at::date
    END
  ),
  period_end = COALESCE(
    period_end,
    CASE
      WHEN period_month ~ '^\d{4}-\d{2}$' THEN (to_date(period_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date
      ELSE created_at::date
    END
  ),
  compare_start = COALESCE(
    compare_start,
    CASE
      WHEN compare_month ~ '^\d{4}-\d{2}$' THEN to_date(compare_month || '-01', 'YYYY-MM-DD')
      ELSE created_at::date
    END
  ),
  compare_end = COALESCE(
    compare_end,
    CASE
      WHEN compare_month ~ '^\d{4}-\d{2}$' THEN (to_date(compare_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date
      ELSE created_at::date
    END
  );

ALTER TABLE analytics_reports
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL,
  ALTER COLUMN compare_start SET NOT NULL,
  ALTER COLUMN compare_end SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analytics_reports'
      AND policyname = 'Users can update own analytics reports'
  ) THEN
    CREATE POLICY "Users can update own analytics reports"
      ON analytics_reports
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
