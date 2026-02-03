-- Fix infinite recursion in team RLS policies
-- The issue is that policies query team_members which triggers other policies, causing recursion
-- Solution: Use SECURITY DEFINER functions to bypass RLS for internal lookups

-- Create SECURITY DEFINER functions to safely query team_members without triggering RLS

CREATE OR REPLACE FUNCTION get_user_team_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT team_id FROM team_members WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_team_admin(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = auth.uid()
    AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION get_team_admin_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tm2.user_id
  FROM team_members tm1
  JOIN team_members tm2 ON tm1.team_id = tm2.team_id
  WHERE tm1.user_id = auth.uid() AND tm2.role = 'admin';
$$;

CREATE OR REPLACE FUNCTION get_team_member_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tm2.user_id
  FROM team_members tm1
  JOIN team_members tm2 ON tm1.team_id = tm2.team_id
  WHERE tm1.user_id = auth.uid();
$$;

-- Drop all existing team_members policies
DROP POLICY IF EXISTS "Team admins can add members" ON team_members;
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
DROP POLICY IF EXISTS "Team admins can remove members" ON team_members;
DROP POLICY IF EXISTS "Team creators can add themselves" ON team_members;
DROP POLICY IF EXISTS "Users can join team via invitation" ON team_members;

-- Drop all existing teams policies
DROP POLICY IF EXISTS "Team members can view their team" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Team admins can update team" ON teams;
DROP POLICY IF EXISTS "Team admins can delete team" ON teams;

-- Drop existing team_invitations policies
DROP POLICY IF EXISTS "Team admins can manage invitations" ON team_invitations;

-- Drop existing shared resource policies
DROP POLICY IF EXISTS "Team members can view team connections" ON klaviyo_connections;
DROP POLICY IF EXISTS "Team members can view team campaigns" ON campaigns;
DROP POLICY IF EXISTS "Team members can view team footers" ON klaviyo_footers;

-- Recreate teams policies using helper functions
CREATE POLICY "Team members can view their team"
  ON teams FOR SELECT
  USING (id = get_user_team_id());

CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Team admins can update team"
  ON teams FOR UPDATE
  USING (is_team_admin(id));

CREATE POLICY "Team admins can delete team"
  ON teams FOR DELETE
  USING (is_team_admin(id));

-- Recreate team_members policies using helper functions
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT
  USING (
    team_id = get_user_team_id()
    OR user_id = auth.uid()
  );

CREATE POLICY "Team creators can add themselves"
  ON team_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM teams WHERE id = team_id AND created_by = auth.uid())
  );

CREATE POLICY "Users can join team via invitation"
  ON team_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_invitations
      WHERE team_invitations.team_id = team_members.team_id
      AND team_invitations.status = 'pending'
    )
  );

CREATE POLICY "Team admins can remove members"
  ON team_members FOR DELETE
  USING (is_team_admin(team_id));

-- Recreate team_invitations policy
CREATE POLICY "Team admins can manage invitations"
  ON team_invitations FOR ALL
  USING (is_team_admin(team_id));

-- Recreate shared resource policies using helper functions
CREATE POLICY "Team members can view team connections"
  ON klaviyo_connections FOR SELECT
  USING (user_id IN (SELECT get_team_admin_ids()));

CREATE POLICY "Team members can view team campaigns"
  ON campaigns FOR SELECT
  USING (user_id IN (SELECT get_team_member_ids()));

CREATE POLICY "Team members can view team footers"
  ON klaviyo_footers FOR SELECT
  USING (user_id IN (SELECT get_team_admin_ids()));
