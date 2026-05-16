-- Per-upload audit trail for KD aggregate stats. The existing seeds_kd_stats
-- table keeps "current value per (scan_date, kingdom_id)" via upsert, so when
-- the user uploads multiple times in one day the prior numbers are lost.
-- This table appends one row per (upload, kingdom_id) so the Comparison view
-- can show a "since last upload" delta with a timestamp.
--
-- KD-level only — duplicating player rows for every upload would explode in
-- size and isn't needed for the ranking widget. uploaded_at is the canonical
-- "when did this snapshot happen" field.
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.seeds_kd_snapshots (
  snapshot_id  bigserial   PRIMARY KEY,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  scan_date    date        NOT NULL,
  kingdom_id   int         NOT NULL,
  power_400    bigint,
  total_kp     bigint,
  power_rank   int,
  kp_rank      int
);

CREATE INDEX IF NOT EXISTS seeds_kd_snapshots_uploaded_at_idx
  ON public.seeds_kd_snapshots (uploaded_at DESC);

-- Composite index optimised for "two most recent snapshots for a KD".
CREATE INDEX IF NOT EXISTS seeds_kd_snapshots_kd_uploaded_at_idx
  ON public.seeds_kd_snapshots (kingdom_id, uploaded_at DESC);

ALTER TABLE public.seeds_kd_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read"   ON public.seeds_kd_snapshots;
DROP POLICY IF EXISTS "Allow public insert" ON public.seeds_kd_snapshots;
DROP POLICY IF EXISTS "Allow public delete" ON public.seeds_kd_snapshots;
CREATE POLICY "Allow public read"   ON public.seeds_kd_snapshots FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.seeds_kd_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.seeds_kd_snapshots FOR DELETE USING (true);

GRANT SELECT, INSERT, DELETE ON public.seeds_kd_snapshots TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE seeds_kd_snapshots_snapshot_id_seq TO anon, authenticated;
