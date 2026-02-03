-- Restore team invitation policies for regular users

DROP POLICY IF EXISTS "Users can view invitations for their email" ON team_invitations;
DROP POLICY IF EXISTS "Users can accept invitations" ON team_invitations;

CREATE POLICY "Users can view invitations for their email"
  ON team_invitations FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR invited_by = auth.uid()
  );

CREATE POLICY "Users can accept invitations"
  ON team_invitations FOR UPDATE
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR status = 'pending'
  );
