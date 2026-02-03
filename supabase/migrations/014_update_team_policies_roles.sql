-- Ensure team policies apply to authenticated users (not just public)

DROP POLICY IF EXISTS "Team members can view their team" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Team admins can update team" ON teams;
DROP POLICY IF EXISTS "Team admins can delete team" ON teams;

CREATE POLICY "Team members can view their team"
  ON teams FOR SELECT
  TO authenticated
  USING (id = get_user_team_id());

CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

CREATE POLICY "Team admins can update team"
  ON teams FOR UPDATE
  TO authenticated
  USING (is_team_admin(id));

CREATE POLICY "Team admins can delete team"
  ON teams FOR DELETE
  TO authenticated
  USING (is_team_admin(id));
