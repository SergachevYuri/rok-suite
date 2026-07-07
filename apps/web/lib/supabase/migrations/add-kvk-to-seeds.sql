-- Add per-KvK scoping to the kingdom-stats scan tables so each KvK can hold its
-- own snapshots independently. dkp_kvks is the single KvK registry across the
-- app (created for the DKP rework). Legacy rows keep kvk_id = NULL and remain
-- visible when the officer picks the "Legacy" bucket in the UI.
--
-- Because kvk_id is part of the row identity, the old primary keys are
-- replaced with a UNIQUE NULLS NOT DISTINCT constraint (requires PG15+, ships
-- with current Supabase). NULLS NOT DISTINCT treats NULL kvk_id as a single
-- value so legacy rows still can't collide with themselves. A surrogate
-- BIGSERIAL id becomes the primary key (PostgREST needs one for full CRUD).

-- ─── seeds_kd_stats ────────────────────────────────────────────────────────
alter table public.seeds_kd_stats
  add column if not exists kvk_id uuid references public.dkp_kvks(id) on delete cascade;

alter table public.seeds_kd_stats drop constraint if exists seeds_kd_stats_pkey;
alter table public.seeds_kd_stats add column if not exists id bigserial;
alter table public.seeds_kd_stats add primary key (id);

alter table public.seeds_kd_stats drop constraint if exists seeds_kd_stats_uniq;
alter table public.seeds_kd_stats
  add constraint seeds_kd_stats_uniq
  unique nulls not distinct (scan_date, kingdom_id, kvk_id);

create index if not exists seeds_kd_stats_kvk_idx
  on public.seeds_kd_stats (kvk_id, scan_date desc, kingdom_id);

-- ─── seeds_kd_players ──────────────────────────────────────────────────────
alter table public.seeds_kd_players
  add column if not exists kvk_id uuid references public.dkp_kvks(id) on delete cascade;

alter table public.seeds_kd_players drop constraint if exists seeds_kd_players_pkey;
alter table public.seeds_kd_players add column if not exists id bigserial;
alter table public.seeds_kd_players add primary key (id);

alter table public.seeds_kd_players drop constraint if exists seeds_kd_players_uniq;
alter table public.seeds_kd_players
  add constraint seeds_kd_players_uniq
  unique nulls not distinct (scan_date, kingdom_id, player_id, kvk_id);

create index if not exists seeds_kd_players_kvk_idx
  on public.seeds_kd_players (kvk_id, scan_date desc, kingdom_id, player_id);

-- ─── cross_season equivalents ──────────────────────────────────────────────
alter table public.cross_season_kd_stats
  add column if not exists kvk_id uuid references public.dkp_kvks(id) on delete cascade;

alter table public.cross_season_kd_stats drop constraint if exists cross_season_kd_stats_pkey;
alter table public.cross_season_kd_stats add column if not exists id bigserial;
alter table public.cross_season_kd_stats add primary key (id);

alter table public.cross_season_kd_stats drop constraint if exists cross_season_kd_stats_uniq;
alter table public.cross_season_kd_stats
  add constraint cross_season_kd_stats_uniq
  unique nulls not distinct (scan_date, kingdom_id, kvk_id);

create index if not exists cross_season_kd_stats_kvk_idx
  on public.cross_season_kd_stats (kvk_id, scan_date desc, kingdom_id);

alter table public.cross_season_kd_players
  add column if not exists kvk_id uuid references public.dkp_kvks(id) on delete cascade;

alter table public.cross_season_kd_players drop constraint if exists cross_season_kd_players_pkey;
alter table public.cross_season_kd_players add column if not exists id bigserial;
alter table public.cross_season_kd_players add primary key (id);

alter table public.cross_season_kd_players drop constraint if exists cross_season_kd_players_uniq;
alter table public.cross_season_kd_players
  add constraint cross_season_kd_players_uniq
  unique nulls not distinct (scan_date, kingdom_id, player_id, kvk_id);

create index if not exists cross_season_kd_players_kvk_idx
  on public.cross_season_kd_players (kvk_id, scan_date desc, kingdom_id, player_id);
