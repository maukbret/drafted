alter table analytics_reports
  add column include_account_overview boolean not null default false;
