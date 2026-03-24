-- Disable Supabase Realtime for tables that no longer use live subscriptions.
DO $$
DECLARE
  table_name text;
  realtime_tables constant text[] := ARRAY[
    'campaigns',
    'team_members',
    'team_invitations',
    'klaviyo_connections',
    'klaviyo_footers'
  ];
BEGIN
  FOREACH table_name IN ARRAY realtime_tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication p
      JOIN pg_publication_rel pr
        ON pr.prpubid = p.oid
      JOIN pg_class c
        ON c.oid = pr.prrelid
      JOIN pg_namespace n
        ON n.oid = c.relnamespace
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'public'
        AND c.relname = table_name
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
        table_name
      );
    END IF;
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.campaigns REPLICA IDENTITY DEFAULT;
ALTER TABLE IF EXISTS public.team_members REPLICA IDENTITY DEFAULT;
ALTER TABLE IF EXISTS public.team_invitations REPLICA IDENTITY DEFAULT;
ALTER TABLE IF EXISTS public.klaviyo_connections REPLICA IDENTITY DEFAULT;
ALTER TABLE IF EXISTS public.klaviyo_footers REPLICA IDENTITY DEFAULT;
