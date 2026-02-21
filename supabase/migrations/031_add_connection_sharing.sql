-- Add is_shared column to klaviyo_connections
ALTER TABLE klaviyo_connections
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing admin connections become shared (preserves current behavior)
UPDATE klaviyo_connections
SET is_shared = true
WHERE user_id IN (
  SELECT user_id FROM team_members WHERE role = 'admin'
);

-- Drop the old policy that auto-exposed all admin connections to team members
DROP POLICY IF EXISTS "Team members can view team connections" ON klaviyo_connections;

-- New policy: team members can only see connections explicitly shared by admins
CREATE POLICY "Team members can view shared connections"
  ON klaviyo_connections FOR SELECT
  TO authenticated
  USING (
    is_shared = true
    AND user_id IN (SELECT get_team_admin_ids())
  );
