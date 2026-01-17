-- Supabase SQL Schema for Figma to Klaviyo App
-- Run this in your Supabase SQL Editor (Database > SQL Editor)

-- Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- Klaviyo connections table
-- Stores OAuth tokens for each user's Klaviyo account
create table public.klaviyo_connections (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Projects table
-- Each project represents one Figma URL being processed
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  figma_url text not null,
  figma_file_key text not null,
  figma_node_id text not null,
  status text default 'processing' check (status in ('processing', 'ready', 'exported', 'error')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Frames table
-- Individual frames/sections extracted from Figma
create table public.frames (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  figma_node_id text not null,
  name text not null,
  image_url text,
  klaviyo_image_url text,
  link_url text,
  display_order integer not null default 0,
  created_at timestamptz default now() not null
);

-- Row Level Security (RLS)
-- This ensures users can only access their own data

alter table public.klaviyo_connections enable row level security;
alter table public.projects enable row level security;
alter table public.frames enable row level security;

-- Policies for klaviyo_connections
create policy "Users can view own klaviyo connections"
  on public.klaviyo_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert own klaviyo connections"
  on public.klaviyo_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own klaviyo connections"
  on public.klaviyo_connections for update
  using (auth.uid() = user_id);

create policy "Users can delete own klaviyo connections"
  on public.klaviyo_connections for delete
  using (auth.uid() = user_id);

-- Policies for projects
create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Policies for frames (access via project ownership)
create policy "Users can view frames of own projects"
  on public.frames for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = frames.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert frames to own projects"
  on public.frames for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = frames.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can update frames of own projects"
  on public.frames for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = frames.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete frames of own projects"
  on public.frames for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = frames.project_id
      and projects.user_id = auth.uid()
    )
  );

-- Function to auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger on_klaviyo_connection_updated
  before update on public.klaviyo_connections
  for each row execute function public.handle_updated_at();

create trigger on_project_updated
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- Indexes for better query performance
create index idx_klaviyo_connections_user_id on public.klaviyo_connections(user_id);
create index idx_projects_user_id on public.projects(user_id);
create index idx_frames_project_id on public.frames(project_id);
create index idx_frames_display_order on public.frames(project_id, display_order);
