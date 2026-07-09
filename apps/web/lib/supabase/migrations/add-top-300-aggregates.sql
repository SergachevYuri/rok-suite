-- Extend the KD aggregate tables with Top-300 metrics so the Charts tab can
-- plot both Top 400 Power / Total KP (existing) and Top 300 Power / Top 300 KP
-- (new). Both columns are computed from the players sheet at upload time; they
-- stay NULL on historical rows and light up from the next upload onwards.

alter table public.seeds_kd_stats
  add column if not exists power_300 bigint,
  add column if not exists kp_300    bigint;

alter table public.cross_season_kd_stats
  add column if not exists power_300 bigint,
  add column if not exists kp_300    bigint;
