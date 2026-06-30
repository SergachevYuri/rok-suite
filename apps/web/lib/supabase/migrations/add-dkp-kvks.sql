-- DKP rework: per-KvK config + datasets, with kingdom tagging.
--
-- Each KvK has its own scoring config (formula + tiers + cutoffs) stored in
-- dkp_config with id = 'simple:<uuid>'. Each dataset upload is tagged with
-- (kvk_id, kingdom_id). Legacy datasets uploaded before this migration keep
-- kvk_id = NULL and stay readable but invisible to the new UI.

create table if not exists public.dkp_kvks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.dkp_kvks enable row level security;

drop policy if exists "Allow public read"   on public.dkp_kvks;
create policy "Allow public read"   on public.dkp_kvks for select using (true);
drop policy if exists "Allow public insert" on public.dkp_kvks;
create policy "Allow public insert" on public.dkp_kvks for insert with check (true);
drop policy if exists "Allow public update" on public.dkp_kvks;
create policy "Allow public update" on public.dkp_kvks for update using (true);
drop policy if exists "Allow public delete" on public.dkp_kvks;
create policy "Allow public delete" on public.dkp_kvks for delete using (true);

-- Tag existing dataset table with KvK + Kingdom. Both nullable so legacy rows survive.
alter table public.dkp_datasets
  add column if not exists kvk_id uuid references public.dkp_kvks(id) on delete cascade,
  add column if not exists kingdom_id int;

create index if not exists dkp_datasets_kvk_kd_idx
  on public.dkp_datasets (kvk_id, kingdom_id, created_at desc);
