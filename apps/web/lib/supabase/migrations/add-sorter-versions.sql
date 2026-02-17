-- Migration: Add sorter_versions table for saving/restoring alliance sorter state

CREATE TABLE IF NOT EXISTS public.sorter_versions (
    id SERIAL PRIMARY KEY,
    scan_id INT NOT NULL REFERENCES public.kingdom_scans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full config snapshot (AllianceConfig[])
    configs JSONB NOT NULL,

    -- Exempt governor IDs snapshot
    exempt_ids BIGINT[] DEFAULT '{}',

    -- Assignment mappings (PlayerAssignment[])
    assignments JSONB NOT NULL,

    -- Denormalized summary stats for fast list display
    player_count INT DEFAULT 0,
    move_count INT DEFAULT 0,
    stay_count INT DEFAULT 0,
    unassigned_count INT DEFAULT 0,

    UNIQUE(scan_id, name)
);

CREATE INDEX idx_sorter_versions_scan_id ON public.sorter_versions(scan_id);

ALTER TABLE public.sorter_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on sorter_versions"
    ON public.sorter_versions FOR SELECT USING (true);

CREATE POLICY "Allow public insert on sorter_versions"
    ON public.sorter_versions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on sorter_versions"
    ON public.sorter_versions FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on sorter_versions"
    ON public.sorter_versions FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sorter_versions TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.sorter_versions_id_seq TO anon;
