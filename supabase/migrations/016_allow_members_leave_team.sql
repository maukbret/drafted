-- Allow members to remove their own membership (leave team)
CREATE POLICY "Team members can leave team"
  ON team_members FOR DELETE
  USING (user_id = auth.uid());
