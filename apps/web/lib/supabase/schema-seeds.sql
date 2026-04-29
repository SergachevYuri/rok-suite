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

DROP POLICY IF EXISTS "seeds_kd_stats_read"   ON seeds_kd_stats;
DROP POLICY IF EXISTS "seeds_kd_stats_write"  ON seeds_kd_stats;
DROP POLICY IF EXISTS "seeds_kd_players_read" ON seeds_kd_players;
DROP POLICY IF EXISTS "seeds_kd_players_write"ON seeds_kd_players;

CREATE POLICY "seeds_kd_stats_read"    ON seeds_kd_stats   FOR SELECT TO authenticated USING (true);
CREATE POLICY "seeds_kd_stats_write"   ON seeds_kd_stats   FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "seeds_kd_players_read"  ON seeds_kd_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "seeds_kd_players_write" ON seeds_kd_players FOR ALL    TO authenticated USING (true) WITH CHECK (true);
