-- ═══════════════════════════════════════════════════════════
-- RoK Kingdom Members — Schema Supabase
-- Eseguire nel SQL Editor di Supabase
-- ═══════════════════════════════════════════════════════════

-- Dati giornalieri dei membri del kingdom
CREATE TABLE IF NOT EXISTS kingdom_members (
  id          BIGINT NOT NULL,
  kingdom_id  INT NOT NULL,
  dt          DATE NOT NULL,
  name        TEXT,
  power       BIGINT,
  max_power   BIGINT,
  collect     BIGINT,
  dead        BIGINT,
  kill        BIGINT,
  t1 BIGINT, t2 BIGINT, t3 BIGINT, t4 BIGINT, t5 BIGINT,
  help        BIGINT,
  dead_t1 BIGINT, dead_t2 BIGINT, dead_t3 BIGINT, dead_t4 BIGINT, dead_t5 BIGINT,
  PRIMARY KEY (id, kingdom_id, dt)
);

-- Index per query dashboard (top 400 per kingdom/giorno, grafici storici)
CREATE INDEX IF NOT EXISTS idx_km_kingdom_dt ON kingdom_members (kingdom_id, dt);

-- Token JWT persistiti tra le run di GitHub Actions
CREATE TABLE IF NOT EXISTS app_tokens (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
