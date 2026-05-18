-- Daily Heroscroll snapshots for the KvK seed-matching analysis. The
-- Comparison tab fetches live data, but to identify exactly when the
-- matchmaking event happens we need a per-day audit of Heroscroll's own
-- aggregates for our 32 KDs (3897-3928).
--
-- Triggered manually via the "Snapshot now" button in the Heroscroll panel.
-- Upsert on (scan_date, kingdom_id) so re-clicking the same day overwrites
-- (the latest click wins). Each row also carries:
--   - captured_at: when WE saved it (server now())
--   - heroscroll_last_updated: when Heroscroll itself last refreshed (their
--     own metric, copied verbatim from the API response). The difference
--     between these two is the data freshness lag.
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.heroscroll_snapshots (
  snapshot_id              bigserial   PRIMARY KEY,
  captured_at              timestamptz NOT NULL DEFAULT now(),
  scan_date                date        NOT NULL DEFAULT CURRENT_DATE,
  kingdom_id               int         NOT NULL,
  total_power              bigint,
  total_killpoints         bigint,
  total_deads              bigint,
  total_troop_power        bigint,
  player_count             int,
  ch25_count               int,
  inactive_player_count    int,
  total_rss_given          bigint,
  total_rss_gathered       bigint,
  total_acclaim            bigint,
  rank                     int,
  heroscroll_last_updated  timestamptz,
  UNIQUE (scan_date, kingdom_id)
);

CREATE INDEX IF NOT EXISTS heroscroll_snapshots_scan_date_idx
  ON public.heroscroll_snapshots (scan_date DESC);
CREATE INDEX IF NOT EXISTS heroscroll_snapshots_kd_scan_date_idx
  ON public.heroscroll_snapshots (kingdom_id, scan_date DESC);

ALTER TABLE public.heroscroll_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read"   ON public.heroscroll_snapshots;
DROP POLICY IF EXISTS "Allow public insert" ON public.heroscroll_snapshots;
DROP POLICY IF EXISTS "Allow public update" ON public.heroscroll_snapshots;
DROP POLICY IF EXISTS "Allow public delete" ON public.heroscroll_snapshots;
CREATE POLICY "Allow public read"   ON public.heroscroll_snapshots FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.heroscroll_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.heroscroll_snapshots FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.heroscroll_snapshots FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.heroscroll_snapshots TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE heroscroll_snapshots_snapshot_id_seq TO anon, authenticated;
