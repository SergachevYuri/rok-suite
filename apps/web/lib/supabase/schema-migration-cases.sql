-- Migration cycle + per-player case tracking.
-- A "cycle" is one round of migration/zeroing (e.g. "April 2026"). Each cycle has a
-- deadline; players flagged on the DKP page are snapshotted into cases for that cycle.
-- Officers claim, contact, and confirm migration. Admins grant exceptions / close cycles.

create table if not exists public.migration_cycles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text,
  name text not null,
  deadline timestamptz not null,
  closed_at timestamptz,
  notes text
);

create index if not exists migration_cycles_created_at_idx
  on public.migration_cycles (created_at desc);

alter table public.migration_cycles enable row level security;

drop policy if exists "Allow public read" on public.migration_cycles;
create policy "Allow public read" on public.migration_cycles for select using (true);
drop policy if exists "Allow public insert" on public.migration_cycles;
create policy "Allow public insert" on public.migration_cycles for insert with check (true);
drop policy if exists "Allow public update" on public.migration_cycles;
create policy "Allow public update" on public.migration_cycles for update using (true);
drop policy if exists "Allow public delete" on public.migration_cycles;
create policy "Allow public delete" on public.migration_cycles for delete using (true);

-- One row per player per cycle. state is the lifecycle position.
-- Snapshots of username and power at case-open keep the historical record stable
-- even if a later scan changes them.

create table if not exists public.migration_cases (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.migration_cycles(id) on delete cascade,
  character_id bigint not null,
  username text not null,
  power_at_open bigint not null default 0,
  state text not null default 'pending'
    check (state in ('pending','claimed','contacted','excepted','migrated','marked_to_zero','zeroed','afk')),
  claimed_by text,
  claimed_at timestamptz,
  contacted_at timestamptz,
  migration_suggested_at timestamptz,
  migrated_confirmed_at timestamptz,
  migrated_confirmed_by text,
  excepted_at timestamptz,
  excepted_by text,
  exception_reason text,
  exception_requested_at timestamptz,
  exception_requested_by text,
  exception_request_reason text,
  exception_suggestion text check (exception_suggestion is null or exception_suggestion in ('approve','deny')),
  marked_to_zero_at timestamptz,
  marked_to_zero_by text,
  zeroed_at timestamptz,
  zeroed_by text,
  afk_at timestamptz,
  afk_by text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (cycle_id, character_id)
);

create index if not exists migration_cases_cycle_idx
  on public.migration_cases (cycle_id);
create index if not exists migration_cases_state_idx
  on public.migration_cases (cycle_id, state);

alter table public.migration_cases enable row level security;

drop policy if exists "Allow public read" on public.migration_cases;
create policy "Allow public read" on public.migration_cases for select using (true);
drop policy if exists "Allow public insert" on public.migration_cases;
create policy "Allow public insert" on public.migration_cases for insert with check (true);
drop policy if exists "Allow public update" on public.migration_cases;
create policy "Allow public update" on public.migration_cases for update using (true);
drop policy if exists "Allow public delete" on public.migration_cases;
create policy "Allow public delete" on public.migration_cases for delete using (true);
