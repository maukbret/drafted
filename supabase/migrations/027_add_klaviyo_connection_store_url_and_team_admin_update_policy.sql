ALTER TABLE klaviyo_connections
ADD COLUMN IF NOT EXISTS store_url TEXT;

DROP POLICY IF EXISTS "Team admins can update team admin connections" ON klaviyo_connections;
CREATE POLICY "Team admins can update team admin connections"
  ON klaviyo_connections FOR UPDATE
  TO authenticated
  USING (
    is_team_admin(get_user_team_id())
    AND user_id IN (SELECT get_team_admin_ids())
  )
  WITH CHECK (
    user_id IN (SELECT get_team_admin_ids())
  );
