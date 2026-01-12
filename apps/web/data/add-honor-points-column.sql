-- Add honor_points column to alliance_roster and roster_snapshots tables
-- Run this FIRST before importing honor points data

-- Add column to alliance_roster (if not exists)
ALTER TABLE alliance_roster ADD COLUMN IF NOT EXISTS honor_points BIGINT DEFAULT 0;

-- Add column to roster_snapshots (if not exists)
ALTER TABLE roster_snapshots ADD COLUMN IF NOT EXISTS honor_points BIGINT DEFAULT 0;
