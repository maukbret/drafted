-- Add is_hidden flag to campaigns
alter table campaigns add column is_hidden boolean not null default false;