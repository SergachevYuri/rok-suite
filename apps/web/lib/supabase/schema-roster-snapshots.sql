-- Schema for Roster Snapshots (Historical Tracking)
-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/mzvxlawobzwiqohmoskm/sql/new

-- =============================================================================
-- ROSTER SNAPSHOTS (Daily power/KP snapshots for historical tracking)
-- =============================================================================

-- Drop existing table if it exists (for clean re-runs)
DROP TABLE IF EXISTS public.roster_snapshots CASCADE;

CREATE TABLE public.roster_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Snapshot metadata
  snapshot_date DATE NOT NULL,           -- Date only (one snapshot per day max)

  -- Member data (denormalized for easy querying without joins)
  member_name TEXT NOT NULL,             -- Player name at time of snapshot
  power BIGINT NOT NULL DEFAULT 0,       -- Power at snapshot time
  kills BIGINT NOT NULL DEFAULT 0,       -- Kill points at snapshot time
  t4_kills BIGINT NOT NULL DEFAULT 0,    -- T4 kill points at snapshot time
  t5_kills BIGINT NOT NULL DEFAULT 0,    -- T5 kill points at snapshot time
  honor_points BIGINT NOT NULL DEFAULT 0, -- Honor points at snapshot time
  role TEXT,                             -- Rank (R1-R5) at snapshot time
  is_active BOOLEAN DEFAULT true,        -- Was member active at snapshot time

  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Constraints
  UNIQUE(snapshot_date, member_name)     -- One entry per member per day
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- For querying snapshots by date (e.g., "show me roster on Jan 5")
CREATE INDEX roster_snapshots_date_idx
  ON public.roster_snapshots(snapshot_date DESC);

-- For querying member history (e.g., "show PlayerX's power over time")
CREATE INDEX roster_snapshots_member_idx
  ON public.roster_snapshots(member_name, snapshot_date DESC);

-- For aggregation queries (e.g., "total active power per day")
CREATE INDEX roster_snapshots_active_date_idx
  ON public.roster_snapshots(snapshot_date, is_active)
  WHERE is_active = true;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.roster_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view snapshots" ON public.roster_snapshots;
DROP POLICY IF EXISTS "Allow anon insert snapshots" ON public.roster_snapshots;
DROP POLICY IF EXISTS "Allow anon update snapshots" ON public.roster_snapshots;
DROP POLICY IF EXISTS "Allow anon delete snapshots" ON public.roster_snapshots;

-- READ: Anyone can view historical data
CREATE POLICY "Anyone can view snapshots"
  ON public.roster_snapshots FOR SELECT
  USING (true);

-- WRITE: Allow anonymous access (same as alliance_roster for internal tool)
CREATE POLICY "Allow anon insert snapshots"
  ON public.roster_snapshots FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anon update snapshots"
  ON public.roster_snapshots FOR UPDATE
  USING (true);

CREATE POLICY "Allow anon delete snapshots"
  ON public.roster_snapshots FOR DELETE
  USING (true);

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_snapshots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_snapshots TO authenticated;

-- =============================================================================
-- HELPER VIEW: Daily Alliance Totals
-- =============================================================================

DROP VIEW IF EXISTS public.roster_daily_totals;

CREATE VIEW public.roster_daily_totals AS
SELECT
  snapshot_date,
  COUNT(*) FILTER (WHERE is_active) as member_count,
  SUM(power) FILTER (WHERE is_active) as total_power,
  SUM(kills) FILTER (WHERE is_active) as total_kills,
  SUM(honor_points) FILTER (WHERE is_active) as total_honor,
  AVG(power) FILTER (WHERE is_active) as avg_power
FROM public.roster_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;

GRANT SELECT ON public.roster_daily_totals TO anon;
GRANT SELECT ON public.roster_daily_totals TO authenticated;
