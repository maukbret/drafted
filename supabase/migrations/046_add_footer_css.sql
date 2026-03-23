-- Add footer_css column to store preserved media queries / responsive CSS
-- extracted from the original Klaviyo email's <head> <style> block.
ALTER TABLE klaviyo_footers
ADD COLUMN IF NOT EXISTS footer_css TEXT;

-- Allow team admins to manage footers for connections owned by members of their team.
-- This enables any admin to update/set up a footer for a shared Klaviyo connection.

CREATE POLICY "Team admins can view team footers"
  ON klaviyo_footers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_footers.user_id
    )
  );

CREATE POLICY "Team admins can insert team footers"
  ON klaviyo_footers FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_footers.user_id
    )
  );

CREATE POLICY "Team admins can update team footers"
  ON klaviyo_footers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_footers.user_id
    )
  );

CREATE POLICY "Team admins can delete team footers"
  ON klaviyo_footers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_footers.user_id
    )
  );
