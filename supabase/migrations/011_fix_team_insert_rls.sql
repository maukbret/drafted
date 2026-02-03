-- Ensure team inserts are tied to the authenticated user
-- This prevents inserts when auth.uid() is missing and locks created_by to the caller

ALTER TABLE teams
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Users can create teams" ON teams;

CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );
