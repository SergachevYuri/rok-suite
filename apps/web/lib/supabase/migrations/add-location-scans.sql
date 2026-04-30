-- Location scans: a separate table from kingdom_scans because they're not the
-- same thing. Location scans (e.g. scan_3923.csv) carry coordinates + power +
-- alliance for every K23 player. Kingdom scans (Davide stats XLSX) carry kills,
-- deaths, gathered, helps. Each is uploaded independently and serves a
-- different purpose; conflating them in kingdom_scans was wrong.
--
-- The Zero List entries get coords refreshed from the latest location_scans
-- row. The Find Candidates view also enriches its candidate rows with coords
-- from the latest location_scans so admins see x/y before adding people.
--
-- Run this in the Supabase SQL Editor. Idempotent.

create table if not exists public.location_scans (
  id            serial primary key,
  created_at    timestamptz not null default now(),
  label         text,
  point_count   int not null default 0,
  uploaded_by   text
);

create index if not exists location_scans_created_at_idx
  on public.location_scans (created_at desc);

create table if not exists public.location_scan_points (
  scan_id       int not null references public.location_scans(id) on delete cascade,
  governor_id   bigint not null,
  name          text,
  power         bigint,
  kills         bigint,
  alliance      text,
  x             integer,
  y             integer,
  castle_hall   integer,
  shield_time_left text,
  primary key (scan_id, governor_id)
);

create index if not exists location_scan_points_gov_idx
  on public.location_scan_points (governor_id);

alter table public.location_scans enable row level security;
alter table public.location_scan_points enable row level security;

drop policy if exists "Allow public read"   on public.location_scans;
drop policy if exists "Allow public insert" on public.location_scans;
drop policy if exists "Allow public delete" on public.location_scans;
create policy "Allow public read"   on public.location_scans for select using (true);
create policy "Allow public insert" on public.location_scans for insert with check (true);
create policy "Allow public delete" on public.location_scans for delete using (true);

drop policy if exists "Allow public read"   on public.location_scan_points;
drop policy if exists "Allow public insert" on public.location_scan_points;
drop policy if exists "Allow public delete" on public.location_scan_points;
create policy "Allow public read"   on public.location_scan_points for select using (true);
create policy "Allow public insert" on public.location_scan_points for insert with check (true);
create policy "Allow public delete" on public.location_scan_points for delete using (true);
