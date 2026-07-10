-- Retroactively populate power_300 / kp_300 on every row of seeds_kd_stats and
-- cross_season_kd_stats using the corresponding players tables. Safe to re-run
-- (only updates rows where either metric is still NULL). Match uses
-- `is not distinct from` on kvk_id so the NULL bucket (legacy) backfills too.
--
-- Semantics per (scan_date, kingdom_id, kvk_id):
--   power_300 = sum of the top-300 players by power in that scan slice
--   kp_300    = sum of the top-300 players by kp    in that scan slice
-- KDs with fewer than 300 players contribute the sum of whatever they have
-- (never NULL — the coalesce guarantees a number so the chart doesn't gap).

-- ─── seeds_kd_stats backfill ───────────────────────────────────────────────
with p_by_power as (
  select scan_date, kingdom_id, kvk_id, sum(power) as sum_power
  from (
    select scan_date, kingdom_id, kvk_id, power,
      row_number() over (partition by scan_date, kingdom_id, kvk_id order by power desc) as rk
    from public.seeds_kd_players
  ) t
  where rk <= 300
  group by scan_date, kingdom_id, kvk_id
),
p_by_kp as (
  select scan_date, kingdom_id, kvk_id, sum(kp) as sum_kp
  from (
    select scan_date, kingdom_id, kvk_id, kp,
      row_number() over (partition by scan_date, kingdom_id, kvk_id order by kp desc) as rk
    from public.seeds_kd_players
  ) t
  where rk <= 300
  group by scan_date, kingdom_id, kvk_id
)
update public.seeds_kd_stats s
set
  power_300 = coalesce(pp.sum_power, 0),
  kp_300    = coalesce(pk.sum_kp, 0)
from p_by_power pp
join p_by_kp pk
  on pk.scan_date  = pp.scan_date
 and pk.kingdom_id = pp.kingdom_id
 and pk.kvk_id is not distinct from pp.kvk_id
where s.scan_date  = pp.scan_date
  and s.kingdom_id = pp.kingdom_id
  and s.kvk_id is not distinct from pp.kvk_id
  and (s.power_300 is null or s.kp_300 is null);

-- ─── cross_season_kd_stats backfill (same shape) ───────────────────────────
with p_by_power as (
  select scan_date, kingdom_id, kvk_id, sum(power) as sum_power
  from (
    select scan_date, kingdom_id, kvk_id, power,
      row_number() over (partition by scan_date, kingdom_id, kvk_id order by power desc) as rk
    from public.cross_season_kd_players
  ) t
  where rk <= 300
  group by scan_date, kingdom_id, kvk_id
),
p_by_kp as (
  select scan_date, kingdom_id, kvk_id, sum(kp) as sum_kp
  from (
    select scan_date, kingdom_id, kvk_id, kp,
      row_number() over (partition by scan_date, kingdom_id, kvk_id order by kp desc) as rk
    from public.cross_season_kd_players
  ) t
  where rk <= 300
  group by scan_date, kingdom_id, kvk_id
)
update public.cross_season_kd_stats s
set
  power_300 = coalesce(pp.sum_power, 0),
  kp_300    = coalesce(pk.sum_kp, 0)
from p_by_power pp
join p_by_kp pk
  on pk.scan_date  = pp.scan_date
 and pk.kingdom_id = pp.kingdom_id
 and pk.kvk_id is not distinct from pp.kvk_id
where s.scan_date  = pp.scan_date
  and s.kingdom_id = pp.kingdom_id
  and s.kvk_id is not distinct from pp.kvk_id
  and (s.power_300 is null or s.kp_300 is null);
