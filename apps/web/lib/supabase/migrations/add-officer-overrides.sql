-- Officer review overrides: persistent per governor_id (not per scan)
-- Officers can mark players as 'confirmed' (yes, really illegal/inactive)
-- or 'cleared' (not actually illegal/inactive, set to ORIGINAL)
CREATE TABLE IF NOT EXISTS public.kingdom_player_overrides (
    governor_id BIGINT PRIMARY KEY,
    officer_status TEXT NOT NULL CHECK (officer_status IN ('confirmed', 'cleared')),
    officer_note TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kingdom_player_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.kingdom_player_overrides FOR SELECT USING (true);
CREATE POLICY "Public insert" ON public.kingdom_player_overrides FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON public.kingdom_player_overrides FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON public.kingdom_player_overrides FOR DELETE USING (true);
