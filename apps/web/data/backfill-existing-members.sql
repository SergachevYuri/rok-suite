-- Backfill existing members who were missed in previous snapshots
-- These members already existed in the alliance but weren't captured in snapshots
-- This prevents them from showing up as "new members" in the membership changes

-- Get the most recent snapshot date and previous snapshot date
-- We'll add these members to BOTH snapshots so they don't appear as joins

-- First, find the two most recent snapshot dates
-- SELECT DISTINCT snapshot_date FROM roster_snapshots ORDER BY snapshot_date DESC LIMIT 2;

-- Members to backfill (existed before but were missed):
-- WOLF, Ceje, ZETMA, Black Ruler, DonV4, MayorEric, Divid3, vn kenji, MadFluffy

-- Insert into the PREVIOUS snapshot (second most recent) so they don't appear as joins
-- Replace 'YYYY-MM-DD' with the actual second most recent snapshot date
-- You can find this by running: SELECT DISTINCT snapshot_date FROM roster_snapshots ORDER BY snapshot_date DESC LIMIT 2;

DO $$
DECLARE
    prev_date DATE;
    curr_date DATE;
BEGIN
    -- Get the two most recent snapshot dates
    SELECT snapshot_date INTO curr_date FROM roster_snapshots ORDER BY snapshot_date DESC LIMIT 1;
    SELECT snapshot_date INTO prev_date FROM roster_snapshots ORDER BY snapshot_date DESC LIMIT 1 OFFSET 1;

    RAISE NOTICE 'Current snapshot date: %, Previous snapshot date: %', curr_date, prev_date;

    -- Backfill members into the previous snapshot
    -- These members existed before but were missed
    INSERT INTO roster_snapshots (snapshot_date, member_name, power, kills, t4_kills, t5_kills, honor_points, role, is_active)
    VALUES
        -- WOLF (existed, power unknown - using 0)
        (prev_date, 'WOLF', 0, 0, 0, 0, 0, 'R1', true),
        -- Ceje (existed, power unknown - using 0)
        (prev_date, 'Ceje', 0, 0, 0, 0, 0, 'R1', true),
        -- ZETMA (existed, power unknown - using 0)
        (prev_date, 'ZETMA', 0, 0, 0, 0, 0, 'R1', true),
        -- Black Ruler (existed, power unknown - using 0)
        (prev_date, 'Black Ruler', 0, 0, 0, 0, 0, 'R1', true),
        -- DonV4 (existed, power unknown - using 0)
        (prev_date, 'DonV4', 0, 0, 0, 0, 0, 'R1', true),
        -- MayorEric (existed, power unknown - using 0)
        (prev_date, 'MayorEric', 0, 0, 0, 0, 0, 'R1', true),
        -- Divid3 (existed, power unknown - using 0)
        (prev_date, 'Divid3', 0, 0, 0, 0, 0, 'R1', true),
        -- vn kenji (existed, has power in roster: 14052895)
        (prev_date, 'vn kenji', 14052895, 0, 0, 0, 0, 'R1', true),
        -- MadFluffy (existed, alliance leader, power: 45542)
        (prev_date, 'MadFluffy', 45542, 0, 0, 0, 0, 'R5', true)
    ON CONFLICT (snapshot_date, member_name)
    DO NOTHING;

    RAISE NOTICE 'Backfilled existing members into previous snapshot';
END $$;

-- Verify the changes:
-- SELECT member_name, snapshot_date, power, role
-- FROM roster_snapshots
-- WHERE member_name IN ('WOLF', 'Ceje', 'ZETMA', 'Black Ruler', 'DonV4', 'MayorEric', 'Divid3', 'vn kenji', 'MadFluffy')
-- ORDER BY snapshot_date DESC, member_name;

-- Check membership changes after running:
-- This query shows joins between the two most recent snapshots
-- After backfill, these members should NOT appear as joins
