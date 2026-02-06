-- Migration: Add King's Recognition Trophy System
-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/mzvxlawobzwiqohmoskm/sql/new

-- =============================================================================
-- CREATE KING_TROPHIES TABLE
-- =============================================================================

-- Trophy types: legendary, epic, elite, advanced
-- Weekly the king can award: 1 legendary, 2 epic, 5 elite, 10 advanced

CREATE TABLE IF NOT EXISTS public.king_trophies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    member_id uuid NOT NULL REFERENCES public.alliance_roster(id) ON DELETE CASCADE,
    trophy_type text NOT NULL CHECK (trophy_type IN ('legendary', 'epic', 'elite', 'advanced')),
    awarded_date date NOT NULL DEFAULT CURRENT_DATE,
    week_of date NOT NULL, -- Start of the week (Monday) this trophy was for
    reason text, -- Optional reason/achievement description
    created_at timestamp with time zone DEFAULT now(),

    -- Prevent duplicate awards for same member in same week with same trophy type
    UNIQUE(member_id, trophy_type, week_of)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS king_trophies_member_id_idx ON public.king_trophies(member_id);
CREATE INDEX IF NOT EXISTS king_trophies_week_of_idx ON public.king_trophies(week_of);
CREATE INDEX IF NOT EXISTS king_trophies_trophy_type_idx ON public.king_trophies(trophy_type);
CREATE INDEX IF NOT EXISTS king_trophies_awarded_date_idx ON public.king_trophies(awarded_date);

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.king_trophies ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on king_trophies"
    ON public.king_trophies
    FOR SELECT
    USING (true);

-- Allow authenticated users to insert/update/delete
CREATE POLICY "Allow authenticated insert on king_trophies"
    ON public.king_trophies
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated update on king_trophies"
    ON public.king_trophies
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on king_trophies"
    ON public.king_trophies
    FOR DELETE
    TO authenticated
    USING (true);

-- =============================================================================
-- HELPER VIEW: Trophy counts per member
-- =============================================================================

CREATE OR REPLACE VIEW public.member_trophy_counts AS
SELECT
    member_id,
    COUNT(*) FILTER (WHERE trophy_type = 'legendary') as legendary_count,
    COUNT(*) FILTER (WHERE trophy_type = 'epic') as epic_count,
    COUNT(*) FILTER (WHERE trophy_type = 'elite') as elite_count,
    COUNT(*) FILTER (WHERE trophy_type = 'advanced') as advanced_count,
    COUNT(*) as total_count,
    MAX(awarded_date) as last_awarded
FROM public.king_trophies
GROUP BY member_id;

-- =============================================================================
-- DONE
-- =============================================================================

-- Verify table was created
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'king_trophies'
ORDER BY ordinal_position;
