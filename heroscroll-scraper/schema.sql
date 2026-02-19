-- Supabase SQL: create the heroscroll_snapshots table
-- Run this in the Supabase SQL Editor

create table if not exists heroscroll_snapshots (
  id            bigint generated always as identity primary key,
  scraped_at    timestamptz not null default now(),
  data_timestamp date not null,
  kingdom_id    int not null,
  rank          int not null,
  power         bigint not null,
  troop_power   bigint not null,
  killpoints    bigint not null,
  deads         bigint not null,
  hero_scroll_rating numeric(6,2) not null,
  player_count  int not null,
  ch25_count    int not null,
  inactive_player_count int not null,
  domain_count  int not null,
  total_rss_given     bigint not null,
  total_rss_gathered  bigint not null,
  lost_kingdom_most_killed_average bigint not null,
  lost_kingdom_most_lost_average   bigint not null,
  scan_tier     text not null,
  has_heroscrolls boolean not null default false,
  is_active     boolean not null default false,
  service_level text,
  has_dashboard boolean not null default false
);

-- Index for fast lookups by kingdom + date
create index if not exists idx_heroscroll_kingdom_date
  on heroscroll_snapshots (kingdom_id, data_timestamp desc);

-- Index for querying latest scrape
create index if not exists idx_heroscroll_scraped_at
  on heroscroll_snapshots (scraped_at desc);

-- Prevent duplicate inserts for the same kingdom on the same scrape run
create unique index if not exists idx_heroscroll_unique_snapshot
  on heroscroll_snapshots (kingdom_id, data_timestamp, scraped_at);
