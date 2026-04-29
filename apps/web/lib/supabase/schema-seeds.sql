-- ═══════════════════════════════════════════════════════════
-- Kingdom Seeds Scan — Schema Supabase
-- Caricamento manuale di file Excel con due fogli:
--   1. KD aggregato (per kingdom: power_400, total_kp, ranks)
--   2. Player dettaglio (per ogni player: power, kp, cityhall, rank)
-- ═══════════════════════════════════════════════════════════

-- Aggregato per kingdom per data scan
CREATE TABLE IF NOT EXISTS seeds_kd_stats (
  scan_date    DATE   NOT NULL,
  kingdom_id   INT    NOT NULL,
  power_400    BIGINT,
  total_kp     BIGINT,
  power_rank   INT,
  kp_rank      INT,
  uploaded_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (scan_date, kingdom_id)
);

-- Dettaglio player per kingdom per data scan
CREATE TABLE IF NOT EXISTS seeds_kd_players (
  scan_date    DATE   NOT NULL,
  kingdom_id   INT    NOT NULL,
  player_id    BIGINT NOT NULL,
  name         TEXT,
  power        BIGINT,
  kp           BIGINT,
  cityhall     INT,
  rank_in_kd   INT,
  uploaded_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (scan_date, kingdom_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_seeds_players_kd_date  ON seeds_kd_players (kingdom_id, scan_date);
CREATE INDEX IF NOT EXISTS idx_seeds_players_date     ON seeds_kd_players (scan_date);
CREATE INDEX IF NOT EXISTS idx_seeds_stats_date       ON seeds_kd_stats   (scan_date);

ALTER TABLE seeds_kd_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeds_kd_players ENABLE ROW LEVEL SECURITY;

-- Public policies (gating is enforced client-side via password). Mirrors the
-- pattern used by other tables in this project (mge, rok-mail, king_trophies, ...).
DROP POLICY IF EXISTS "Allow public read"   ON seeds_kd_stats;
DROP POLICY IF EXISTS "Allow public insert" ON seeds_kd_stats;
DROP POLICY IF EXISTS "Allow public update" ON seeds_kd_stats;
DROP POLICY IF EXISTS "Allow public delete" ON seeds_kd_stats;
CREATE POLICY "Allow public read"   ON seeds_kd_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON seeds_kd_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON seeds_kd_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON seeds_kd_stats FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read"   ON seeds_kd_players;
DROP POLICY IF EXISTS "Allow public insert" ON seeds_kd_players;
DROP POLICY IF EXISTS "Allow public update" ON seeds_kd_players;
DROP POLICY IF EXISTS "Allow public delete" ON seeds_kd_players;
CREATE POLICY "Allow public read"   ON seeds_kd_players FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON seeds_kd_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON seeds_kd_players FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON seeds_kd_players FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON seeds_kd_stats   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON seeds_kd_players TO anon, authenticated;
