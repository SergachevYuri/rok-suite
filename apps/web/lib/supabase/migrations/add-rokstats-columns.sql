-- Migration: Add ROKstats columns to alliance_roster
-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/mzvxlawobzwiqohmoskm/sql/new

-- =============================================================================
-- ADD NEW COLUMNS TO ALLIANCE_ROSTER
-- =============================================================================

-- Governor ID (numeric game ID)
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS governor_id bigint;

-- Kingdom and Camp info
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS kingdom text;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS camp text;

-- Power tracking
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS highest_power bigint DEFAULT 0;

-- Additional kill tiers (T1, T2, T3)
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS t1_kills bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS t2_kills bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS t3_kills bigint DEFAULT 0;

-- Combat stats
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS victories bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS defeats bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS scout_times bigint DEFAULT 0;

-- Support stats
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS troops_healed bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS gathered bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS assistance bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS helps bigint DEFAULT 0;

-- KvK specific
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS acclaim bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS kvk_points bigint DEFAULT 0;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS trades bigint DEFAULT 0;

-- Profile info
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS castle_hall integer;

ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS civilization text;

-- =============================================================================
-- ADD INDEX FOR GOVERNOR_ID LOOKUPS
-- =============================================================================

CREATE INDEX IF NOT EXISTS alliance_roster_governor_id_idx
ON public.alliance_roster(governor_id);

-- =============================================================================
-- UPDATE ROSTER_SNAPSHOTS TO TRACK NEW FIELDS
-- =============================================================================

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS highest_power bigint DEFAULT 0;

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS t1_kills bigint DEFAULT 0;

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS t2_kills bigint DEFAULT 0;

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS t3_kills bigint DEFAULT 0;

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS troops_healed bigint DEFAULT 0;

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS acclaim bigint DEFAULT 0;

ALTER TABLE public.roster_snapshots
ADD COLUMN IF NOT EXISTS kvk_points bigint DEFAULT 0;

-- =============================================================================
-- DONE
-- =============================================================================

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'alliance_roster'
ORDER BY ordinal_position;
