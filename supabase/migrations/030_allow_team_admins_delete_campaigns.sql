-- Allow team admins to delete campaigns created by members in their team.

CREATE POLICY "Team admins can delete team member campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM team_members admin_tm
      JOIN team_members creator_tm ON creator_tm.team_id = admin_tm.team_id
      WHERE admin_tm.user_id = auth.uid()
        AND admin_tm.role = 'admin'
        AND creator_tm.user_id = campaigns.user_id
    )
  );
