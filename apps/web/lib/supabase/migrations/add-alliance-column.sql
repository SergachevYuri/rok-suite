-- Migration: Add alliance column to alliance_roster
-- Run this in your Supabase SQL Editor

-- Add alliance column for tracking player's home alliance
ALTER TABLE public.alliance_roster
ADD COLUMN IF NOT EXISTS alliance text;

-- Add index for alliance filtering
CREATE INDEX IF NOT EXISTS alliance_roster_alliance_idx
ON public.alliance_roster(alliance);

-- Verify column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'alliance_roster' AND column_name = 'alliance';
