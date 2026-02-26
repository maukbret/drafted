-- Analytics cache table: stores fetched Klaviyo analytics data per connection + period
CREATE TABLE klaviyo_analytics_cache (
  id uuid default uuid_generate_v4() primary key,
  connection_id uuid references klaviyo_connections(id) on delete cascade not null,
  cache_key text not null,  -- "{periodStart}_{periodEnd}"
  period_start date not null,
  period_end date not null,
  comp_period_start date not null,
  comp_period_end date not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  unique(connection_id, cache_key)
);

ALTER TABLE klaviyo_analytics_cache ENABLE ROW LEVEL SECURITY;

-- Only connection owner or team admins can read/write cache
-- We use a permissive policy; actual access control is enforced in the API routes
CREATE POLICY "Users can manage their own connection cache"
  ON klaviyo_analytics_cache
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM klaviyo_connections WHERE user_id = auth.uid()
    )
  );

-- Analytics preferences: stores per-user, per-connection UI selections (list, form)
CREATE TABLE klaviyo_analytics_preferences (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  connection_id uuid references klaviyo_connections(id) on delete cascade not null,
  selected_list_id text,
  selected_list_name text,
  selected_form_id text,
  selected_form_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id, connection_id)
);

ALTER TABLE klaviyo_analytics_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own analytics preferences"
  ON klaviyo_analytics_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
