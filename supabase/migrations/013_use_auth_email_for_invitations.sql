-- Avoid querying auth.users directly from RLS policies
-- Use auth.email() which reads the email claim from JWT

DROP POLICY IF EXISTS "Users can view invitations for their email" ON team_invitations;
DROP POLICY IF EXISTS "Users can accept invitations" ON team_invitations;

CREATE POLICY "Users can view invitations for their email"
  ON team_invitations FOR SELECT
  USING (
    email = auth.email()
    OR invited_by = auth.uid()
  );

CREATE POLICY "Users can accept invitations"
  ON team_invitations FOR UPDATE
  USING (
    email = auth.email()
    OR status = 'pending'
  );
