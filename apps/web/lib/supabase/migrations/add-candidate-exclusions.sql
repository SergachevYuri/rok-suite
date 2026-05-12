-- Manual exclusion list for the Possible Candidates page. When an officer/
-- admin doesn't want a specific player to be reachable from the candidates
-- view (e.g. private agreement, do-not-contact, prior bad outreach experience)
-- they click "Exclude" on the row, which adds an entry here and hides the
-- player from the candidates list — even before the Fill (outreach) step,
-- so they can't be added to outreach by mistake.
--
-- Per-season: a player can be excluded from the KvK candidates without
-- affecting cross-season recruiting, and vice versa.
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.candidate_exclusions (
  player_id   bigint NOT NULL,
  -- 'kvk' for the same-season KvK pool, 'cross' for the cross-season pool.
  -- Mirrors the Season type in lib/kingdom/season-config.ts.
  source      text   NOT NULL CHECK (source IN ('kvk', 'cross')),
  excluded_by text,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  reason      text,
  PRIMARY KEY (player_id, source)
);

CREATE INDEX IF NOT EXISTS candidate_exclusions_source_idx
  ON public.candidate_exclusions (source);
CREATE INDEX IF NOT EXISTS candidate_exclusions_excluded_at_idx
  ON public.candidate_exclusions (excluded_at DESC);

ALTER TABLE public.candidate_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read"   ON public.candidate_exclusions;
DROP POLICY IF EXISTS "Allow public insert" ON public.candidate_exclusions;
DROP POLICY IF EXISTS "Allow public delete" ON public.candidate_exclusions;
CREATE POLICY "Allow public read"   ON public.candidate_exclusions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.candidate_exclusions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.candidate_exclusions FOR DELETE USING (true);

GRANT SELECT, INSERT, DELETE ON public.candidate_exclusions TO anon, authenticated;
