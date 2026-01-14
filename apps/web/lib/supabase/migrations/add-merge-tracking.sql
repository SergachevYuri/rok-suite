-- Migration: Add merge tracking columns to alliance_roster
-- Run this in your Supabase SQL Editor

-- Array of alternate names this player has used
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS alternate_names text[] DEFAULT '{}';

-- Reference to the primary record this was merged into (if inactive due to merge)
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.alliance_roster(id);

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'alliance_roster'
  AND column_name IN ('alternate_names', 'merged_into');
