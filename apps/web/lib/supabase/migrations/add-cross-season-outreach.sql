-- Outreach tracking for the cross-season candidate pool. Same shape as
-- migration_outreach but kept in a separate table so cross-season recruits
-- have their own contact log (and won't get auto-skipped by a previous
-- KvK contact attempt on the same player).
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.cross_season_outreach (
  player_id     bigint PRIMARY KEY,
  kingdom_id    int    NOT NULL,
  name          text,
  power         bigint NOT NULL DEFAULT 0,
  kp            bigint NOT NULL DEFAULT 0,
  cityhall      int    NOT NULL DEFAULT 0,
  rank_in_kd    int,
  source_scan_date date,
  added_at      timestamptz NOT NULL DEFAULT now(),
  added_by      text,
  contacted     boolean NOT NULL DEFAULT false,
  contacted_at  timestamptz,
  contacted_by  text,
  response      text,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cross_season_outreach_added_at_idx
  ON public.cross_season_outreach (added_at DESC);

CREATE INDEX IF NOT EXISTS cross_season_outreach_contacted_idx
  ON public.cross_season_outreach (contacted);

ALTER TABLE public.cross_season_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read"   ON public.cross_season_outreach;
DROP POLICY IF EXISTS "Allow public insert" ON public.cross_season_outreach;
DROP POLICY IF EXISTS "Allow public update" ON public.cross_season_outreach;
DROP POLICY IF EXISTS "Allow public delete" ON public.cross_season_outreach;
CREATE POLICY "Allow public read"   ON public.cross_season_outreach FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.cross_season_outreach FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.cross_season_outreach FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.cross_season_outreach FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_season_outreach TO anon, authenticated;
