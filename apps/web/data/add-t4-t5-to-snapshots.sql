-- Add T4/T5 kill columns to roster_snapshots table
-- Run this in Supabase SQL Editor

-- Add columns (if not exists)
ALTER TABLE roster_snapshots ADD COLUMN IF NOT EXISTS t4_kills BIGINT NOT NULL DEFAULT 0;
ALTER TABLE roster_snapshots ADD COLUMN IF NOT EXISTS t5_kills BIGINT NOT NULL DEFAULT 0;

-- Verification
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'roster_snapshots' 
ORDER BY ordinal_position;
