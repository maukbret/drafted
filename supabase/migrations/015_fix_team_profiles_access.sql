-- Fix team member access to profiles and ensure all team-related RLS policies work correctly
-- Issue: Team members cannot view other team members' profiles, causing joins to fail

-- Add policy for team members to view other team members' profiles
CREATE POLICY "Team members can view team profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_team_member_ids())
  );

-- Update klaviyo_connections policy to use TO authenticated for consistency
DROP POLICY IF EXISTS "Team members can view team connections" ON klaviyo_connections;
CREATE POLICY "Team members can view team connections"
  ON klaviyo_connections FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_team_admin_ids()));

-- Update klaviyo_footers policy to use TO authenticated for consistency
DROP POLICY IF EXISTS "Team members can view team footers" ON klaviyo_footers;
CREATE POLICY "Team members can view team footers"
  ON klaviyo_footers FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_team_admin_ids()));

-- Update campaigns policy to use TO authenticated for consistency
DROP POLICY IF EXISTS "Team members can view team campaigns" ON campaigns;
CREATE POLICY "Team members can view team campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_team_member_ids()));

-- Update team_members policies to use TO authenticated
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    team_id = get_user_team_id()
    OR user_id = auth.uid()
  );

-- Allow team members to view projects created by other team members
-- This is needed to see campaign previews for team campaigns
CREATE POLICY "Team members can view team projects"
  ON projects FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_team_member_ids()));

-- Allow team members to view frames from team projects
CREATE POLICY "Team members can view team frames"
  ON frames FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id IN (SELECT get_team_member_ids())
    )
  );

-- Allow connection owners to view all campaigns that use their connections
-- This ensures admins can still see campaigns created by ex-members
CREATE POLICY "Connection owners can view campaigns using their connections"
  ON campaigns FOR SELECT
  TO authenticated
  USING (
    klaviyo_connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

-- Allow connection owners to view projects for campaigns using their connections
CREATE POLICY "Connection owners can view projects for their connection campaigns"
  ON projects FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT project_id FROM campaigns
      WHERE klaviyo_connection_id IN (
        SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
      )
    )
  );

-- Allow connection owners to view frames for campaigns using their connections
CREATE POLICY "Connection owners can view frames for their connection campaigns"
  ON frames FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM campaigns
      WHERE klaviyo_connection_id IN (
        SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
      )
    )
  );

-- Allow connection owners to delete campaigns that use their connections
CREATE POLICY "Connection owners can delete campaigns using their connections"
  ON campaigns FOR DELETE
  TO authenticated
  USING (
    klaviyo_connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

-- Allow connection owners to delete projects for campaigns using their connections
CREATE POLICY "Connection owners can delete projects for their connection campaigns"
  ON projects FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT project_id FROM campaigns
      WHERE klaviyo_connection_id IN (
        SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
      )
    )
  );

-- Allow connection owners to delete frames for campaigns using their connections
CREATE POLICY "Connection owners can delete frames for their connection campaigns"
  ON frames FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM campaigns
      WHERE klaviyo_connection_id IN (
        SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
      )
    )
  );
