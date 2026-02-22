-- Fix kingdom stats page: replace full-table-scan queries with efficient RPCs.
-- The old approach fetched ALL rows client-side just to get unique kingdom_ids
-- and dates, which times out as the table grows.
-- Run this in your Supabase SQL Editor.

-- 1. Get distinct kingdom IDs (replaces full table scan + client-side Set)
CREATE OR REPLACE FUNCTION public.get_distinct_kingdom_ids()
RETURNS SETOF INT
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT kingdom_id FROM public.kingdom_members ORDER BY kingdom_id;
$$;

-- 2. Get distinct dates for a kingdom (replaces .limit(1000) + client-side Set)
CREATE OR REPLACE FUNCTION public.get_distinct_kingdom_dates(p_kingdom_id INT)
RETURNS SETOF DATE
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT dt FROM public.kingdom_members
  WHERE kingdom_id = p_kingdom_id
  ORDER BY dt DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_distinct_kingdom_ids() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_kingdom_dates(INT) TO anon, authenticated;
