-- Manual "this new arrival is fine" list. The Global candidates view treats
-- everyone in the latest scan but not in the seed-day baseline as a *new
-- arrival* (i.e. potentially illegal). Admins can mark individual players as
-- legit, which adds them here and removes them from the new-arrivals view.
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.migration_clearances (
  player_id    bigint PRIMARY KEY,
  cleared_by   text,
  cleared_at   timestamptz NOT NULL DEFAULT now(),
  note         text
);

CREATE INDEX IF NOT EXISTS migration_clearances_cleared_at_idx
  ON public.migration_clearances (cleared_at DESC);

ALTER TABLE public.migration_clearances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read"   ON public.migration_clearances;
DROP POLICY IF EXISTS "Allow public insert" ON public.migration_clearances;
DROP POLICY IF EXISTS "Allow public delete" ON public.migration_clearances;
CREATE POLICY "Allow public read"   ON public.migration_clearances FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.migration_clearances FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.migration_clearances FOR DELETE USING (true);

GRANT SELECT, INSERT, DELETE ON public.migration_clearances TO anon, authenticated;
