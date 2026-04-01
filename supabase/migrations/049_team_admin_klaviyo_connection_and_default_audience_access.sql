-- Team admins can update member-owned connections (store URL, name, etc.), not only other admins'.
CREATE POLICY "Team admins can update teammate klaviyo connections"
  ON klaviyo_connections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_connections.user_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_connections.user_id
    )
  );

-- Team admins can SELECT teammate Klaviyo connections (needed for API routes that load by id).
CREATE POLICY "Team admins can view team klaviyo connections"
  ON klaviyo_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_connections.user_id
    )
  );

-- Default audience presets: allow team admins to read teammate-owned rows (writes may use service role).
CREATE POLICY "Team admins can view team default audiences"
  ON klaviyo_default_audiences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS my_membership
      JOIN team_members AS owner_membership
        ON my_membership.team_id = owner_membership.team_id
      WHERE my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
        AND owner_membership.user_id = klaviyo_default_audiences.user_id
    )
  );
