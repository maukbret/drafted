-- Enable Supabase Realtime on key tables for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE team_invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE klaviyo_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE klaviyo_footers;

-- Enable full replica identity so UPDATE/DELETE payloads include old values
ALTER TABLE campaigns REPLICA IDENTITY FULL;
ALTER TABLE team_members REPLICA IDENTITY FULL;
ALTER TABLE team_invitations REPLICA IDENTITY FULL;
ALTER TABLE klaviyo_connections REPLICA IDENTITY FULL;
ALTER TABLE klaviyo_footers REPLICA IDENTITY FULL;
