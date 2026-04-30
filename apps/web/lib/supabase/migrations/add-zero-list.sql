-- Zero List: kingdom-scoped, continuous (no cycle / no deadline) case tracking.
-- A second source of cases living in the same `migration_cases` table so that the
-- existing state machine and UI components keep working unchanged.
--
-- Zero-list cases differ from cycle cases in three ways:
--   1. cycle_id is NULL
--   2. source_kind = 'zero_list'
--   3. coordinates and last-seen scan info are populated from kingdom scan data
--
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run multiple times.

-- ─── 1. Make cycle_id nullable so zero-list rows can omit it ──────────────────
alter table public.migration_cases
  alter column cycle_id drop not null;

-- ─── 2. Add source + coord + scan-ref columns ────────────────────────────────
alter table public.migration_cases
  add column if not exists source_kind text not null default 'cycle'
    check (source_kind in ('cycle','zero_list')),
  add column if not exists x integer,
  add column if not exists y integer,
  add column if not exists last_seen_scan_id integer,
  add column if not exists last_seen_power bigint,
  add column if not exists last_seen_alliance text,
  add column if not exists added_by text,
  add column if not exists added_reason text;

create index if not exists migration_cases_source_kind_idx
  on public.migration_cases (source_kind);

-- ─── 3. Replace the (cycle_id, character_id) unique constraint ───────────────
-- Old constraint was (cycle_id, character_id) UNIQUE — would now allow multiple
-- zero-list rows for the same character_id since cycle_id is null.
-- New constraint scopes uniqueness within (cycle_id, source_kind) using a partial
-- unique index per source.
alter table public.migration_cases
  drop constraint if exists migration_cases_cycle_id_character_id_key;

-- One row per (cycle, character) for cycle cases — same as before, modulo NULL handling.
create unique index if not exists migration_cases_cycle_character_uniq
  on public.migration_cases (cycle_id, character_id)
  where source_kind = 'cycle';

-- One row per character on the zero list (kingdom-scoped, no cycle).
create unique index if not exists migration_cases_zero_list_character_uniq
  on public.migration_cases (character_id)
  where source_kind = 'zero_list';

-- ─── 4. Helpful indexes ──────────────────────────────────────────────────────
create index if not exists migration_cases_zero_list_state_idx
  on public.migration_cases (state, character_id)
  where source_kind = 'zero_list';
