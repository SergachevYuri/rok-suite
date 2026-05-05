-- Outreach list for the "Possible candidates" page.
-- Officers/admins click "Fill" on a candidate row to add the player here.
-- Then leadership tracks who reached out, the response, and contact status.
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.migration_outreach (
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

CREATE INDEX IF NOT EXISTS migration_outreach_added_at_idx
  ON public.migration_outreach (added_at DESC);

CREATE INDEX IF NOT EXISTS migration_outreach_contacted_idx
  ON public.migration_outreach (contacted);

ALTER TABLE public.migration_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read"   ON public.migration_outreach;
DROP POLICY IF EXISTS "Allow public insert" ON public.migration_outreach;
DROP POLICY IF EXISTS "Allow public update" ON public.migration_outreach;
DROP POLICY IF EXISTS "Allow public delete" ON public.migration_outreach;
CREATE POLICY "Allow public read"   ON public.migration_outreach FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.migration_outreach FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.migration_outreach FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.migration_outreach FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_outreach TO anon, authenticated;
