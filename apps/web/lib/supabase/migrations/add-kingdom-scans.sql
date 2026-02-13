-- =============================================================================
-- KINGDOM SCANS: Migration tracking + Alliance sorting
-- =============================================================================

-- Scan session metadata
CREATE TABLE IF NOT EXISTS public.kingdom_scans (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    label TEXT NOT NULL DEFAULT '',
    snapshot_count INT DEFAULT 0,
    kingdom_count INT DEFAULT 0,
    migrant_count INT DEFAULT 0,
    pre_migration_count INT DEFAULT 0
);

ALTER TABLE public.kingdom_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on kingdom_scans" ON public.kingdom_scans FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kingdom_scans" ON public.kingdom_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kingdom_scans" ON public.kingdom_scans FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kingdom_scans" ON public.kingdom_scans FOR DELETE USING (true);

-- Player data from each scan
CREATE TABLE IF NOT EXISTS public.kingdom_scan_players (
    id SERIAL PRIMARY KEY,
    scan_id INT NOT NULL REFERENCES public.kingdom_scans(id) ON DELETE CASCADE,
    governor_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    power BIGINT DEFAULT 0,
    highest_power BIGINT DEFAULT 0,
    kill_points BIGINT DEFAULT 0,
    t4_kills BIGINT DEFAULT 0,
    t5_kills BIGINT DEFAULT 0,
    deaths BIGINT DEFAULT 0,
    gathered BIGINT DEFAULT 0,
    alliance_helps INT DEFAULT 0,
    current_alliance TEXT DEFAULT '',
    x INT,
    y INT,
    castle_hall INT,
    shield_time_left TEXT,

    -- Migration fields
    migration_status TEXT NOT NULL DEFAULT 'ORIGINAL',
    is_migrant BOOLEAN DEFAULT FALSE,
    migrant_accepted BOOLEAN DEFAULT FALSE,
    migrant_group TEXT,
    migrant_recruiter TEXT,
    starting_kd TEXT,
    existed_pre_migration BOOLEAN DEFAULT FALSE,
    sources TEXT[] DEFAULT '{}',

    -- Alliance assignment (filled by sorter)
    assigned_alliance TEXT,
    assignment_status TEXT,
    assignment_reason TEXT,

    UNIQUE(scan_id, governor_id)
);

CREATE INDEX idx_kingdom_scan_players_scan_id ON public.kingdom_scan_players(scan_id);
CREATE INDEX idx_kingdom_scan_players_migration ON public.kingdom_scan_players(scan_id, migration_status);

ALTER TABLE public.kingdom_scan_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on kingdom_scan_players" ON public.kingdom_scan_players FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kingdom_scan_players" ON public.kingdom_scan_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kingdom_scan_players" ON public.kingdom_scan_players FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kingdom_scan_players" ON public.kingdom_scan_players FOR DELETE USING (true);

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'kingdom_scans and kingdom_scan_players tables created' AS status;
