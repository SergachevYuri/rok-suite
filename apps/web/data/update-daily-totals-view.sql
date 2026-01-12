-- Update roster_daily_totals view to include total_honor
-- Run this in Supabase SQL Editor

DROP VIEW IF EXISTS public.roster_daily_totals;

CREATE VIEW public.roster_daily_totals AS
SELECT
  snapshot_date,
  COUNT(*) FILTER (WHERE is_active) as member_count,
  SUM(power) FILTER (WHERE is_active) as total_power,
  SUM(kills) FILTER (WHERE is_active) as total_kills,
  SUM(honor_points) FILTER (WHERE is_active) as total_honor,
  AVG(power) FILTER (WHERE is_active) as avg_power
FROM public.roster_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;

GRANT SELECT ON public.roster_daily_totals TO anon;
GRANT SELECT ON public.roster_daily_totals TO authenticated;
