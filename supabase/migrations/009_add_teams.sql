-- Teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members with roles
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id),
  UNIQUE(user_id)  -- User can only be in one team
);

-- Invitations (for invite links + in-app notifications)
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  email TEXT,  -- Optional: for display purposes
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_invitations_token ON team_invitations(token);
CREATE INDEX idx_team_invitations_email ON team_invitations(email);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Helper functions to avoid RLS recursion on team_members table
-- These use SECURITY DEFINER to bypass RLS for internal lookups

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

-- Teams policies
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

-- Team members policies (using helper functions to avoid recursion)
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT
  USING (
    team_id = get_user_team_id()
    OR user_id = auth.uid()
  );

-- Allow team creators to add themselves as the first member
CREATE POLICY "Team creators can add themselves"
  ON team_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM teams WHERE id = team_id AND created_by = auth.uid())
  );

-- Allow users to join a team via invitation
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

-- Invitations policies
CREATE POLICY "Team admins can manage invitations"
  ON team_invitations FOR ALL
  USING (is_team_admin(team_id));

CREATE POLICY "Users can view invitations for their email"
  ON team_invitations FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR invited_by = auth.uid()
  );

-- Policy for accepting invitations (anyone with token can update status)
CREATE POLICY "Users can accept invitations"
  ON team_invitations FOR UPDATE
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR status = 'pending'
  );

-- Helper function to get team admin user IDs (used for checking shared resources)
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

-- Helper function to get all team member user IDs
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

-- Updated RLS policies for existing tables to allow team access

-- Klaviyo connections: Team members can read admin's connections
CREATE POLICY "Team members can view team connections"
  ON klaviyo_connections FOR SELECT
  USING (user_id IN (SELECT get_team_admin_ids()));

-- Campaigns: Team members can see each other's campaigns
CREATE POLICY "Team members can view team campaigns"
  ON campaigns FOR SELECT
  USING (user_id IN (SELECT get_team_member_ids()));

-- Klaviyo footers: Team members can access admin's footers
CREATE POLICY "Team members can view team footers"
  ON klaviyo_footers FOR SELECT
  USING (user_id IN (SELECT get_team_admin_ids()));
