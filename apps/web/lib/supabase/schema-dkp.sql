-- DKP datasets: one row per officer upload of a merged kingdom-stats + honor-rankings snapshot.
-- The page reads the most recent row.

create table if not exists public.dkp_datasets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploaded_by text,
  stats_file_name text,
  honor_file_name text,
  player_count int not null default 0,
  players jsonb not null
);

create index if not exists dkp_datasets_created_at_idx
  on public.dkp_datasets (created_at desc);

alter table public.dkp_datasets enable row level security;

-- Matches the repo's existing pattern: officer auth is client-side (password),
-- so Postgres RLS is permissive and the app gates writes in the UI.
drop policy if exists "Allow public read" on public.dkp_datasets;
create policy "Allow public read"   on public.dkp_datasets for select using (true);
drop policy if exists "Allow public insert" on public.dkp_datasets;
create policy "Allow public insert" on public.dkp_datasets for insert with check (true);
drop policy if exists "Allow public delete" on public.dkp_datasets;
create policy "Allow public delete" on public.dkp_datasets for delete using (true);
