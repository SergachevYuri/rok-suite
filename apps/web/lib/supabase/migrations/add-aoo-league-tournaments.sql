-- Schema for AoO League Tournaments — locks the league roster of 45 players
-- across the duration of a tournament. While a tournament is active the team
-- builder reads the league roster from this snapshot instead of the live
-- league sheet tab, so mid-tournament edits to the sheet can't change who's
-- committed to play.
--
-- Run in the Supabase SQL editor. Idempotent.

create table if not exists public.aoo_league_tournaments (
  id uuid default gen_random_uuid() primary key,

  -- Officer-supplied label, e.g. "Spring 2026 League"
  name text not null,

  -- Frozen snapshot of AooRegistration rows from the league tab at start time.
  -- Stored as JSON so the planner can hydrate full registration objects
  -- (name, govId, power, role flags, lane, sub) without re-fetching the sheet.
  roster jsonb not null,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by text,
  ended_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active (ended_at IS NULL) tournament at a time. Partial unique
-- index on a constant expression enforces the singleton.
create unique index if not exists aoo_league_tournaments_one_active
  on public.aoo_league_tournaments ((ended_at is null))
  where ended_at is null;

create index if not exists aoo_league_tournaments_started_at_idx
  on public.aoo_league_tournaments (started_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.aoo_league_tournaments enable row level security;

drop policy if exists "Anyone can view league tournaments" on public.aoo_league_tournaments;
drop policy if exists "Officers can start league tournaments" on public.aoo_league_tournaments;
drop policy if exists "Officers can update league tournaments" on public.aoo_league_tournaments;
drop policy if exists "Officers can delete league tournaments" on public.aoo_league_tournaments;

-- Anyone can read the active/historical tournament roster (drives the planner)
create policy "Anyone can view league tournaments"
  on public.aoo_league_tournaments for select
  using (true);

-- Only officers/leaders/admins can start, end, or remove a tournament
create policy "Officers can start league tournaments"
  on public.aoo_league_tournaments for insert
  with check (public.is_officer_or_above());

create policy "Officers can update league tournaments"
  on public.aoo_league_tournaments for update
  using (public.is_officer_or_above());

create policy "Officers can delete league tournaments"
  on public.aoo_league_tournaments for delete
  using (public.is_officer_or_above());

grant select on public.aoo_league_tournaments to anon;
grant select, insert, update, delete on public.aoo_league_tournaments to authenticated;
