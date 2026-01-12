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

-- This script backfills members into ALL previous snapshots
-- so they don't appear as "joined" in the member changes

DO $$
DECLARE
    snap_date DATE;
    curr_date DATE;
    members_to_backfill TEXT[] := ARRAY['WOLF', 'Ceje', 'ZETMA', 'Black Ruler', 'DonV4', 'MayorEric', 'Divid3', 'vn kenji', 'MadFluffy'];
    member_name TEXT;
BEGIN
    -- Get the most recent snapshot date (current)
    SELECT snapshot_date INTO curr_date FROM roster_snapshots ORDER BY snapshot_date DESC LIMIT 1;
    RAISE NOTICE 'Current (most recent) snapshot date: %', curr_date;

    -- Loop through ALL snapshot dates EXCEPT the current one
    FOR snap_date IN
        SELECT DISTINCT snapshot_date
        FROM roster_snapshots
        WHERE snapshot_date < curr_date
        ORDER BY snapshot_date
    LOOP
        RAISE NOTICE 'Backfilling members into snapshot date: %', snap_date;

        -- Insert each member into this snapshot date
        FOREACH member_name IN ARRAY members_to_backfill
        LOOP
            INSERT INTO roster_snapshots (snapshot_date, member_name, power, kills, t4_kills, t5_kills, honor_points, role, is_active)
            VALUES (
                snap_date,
                member_name,
                CASE member_name
                    WHEN 'vn kenji' THEN 14052895
                    WHEN 'MadFluffy' THEN 45542
                    ELSE 0
                END,
                0, 0, 0, 0,
                CASE member_name WHEN 'MadFluffy' THEN 'R5' ELSE 'R1' END,
                true
            )
            ON CONFLICT (snapshot_date, member_name) DO NOTHING;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Backfill complete for all previous snapshot dates';
END $$;

-- Verify the backfill worked:
-- SELECT member_name, COUNT(*) as snapshot_count, MIN(snapshot_date) as first_seen, MAX(snapshot_date) as last_seen
-- FROM roster_snapshots
-- WHERE member_name IN ('WOLF', 'Ceje', 'ZETMA', 'Black Ruler', 'DonV4', 'MayorEric', 'Divid3', 'vn kenji', 'MadFluffy')
-- GROUP BY member_name
-- ORDER BY member_name;

-- Verify the changes:
-- SELECT member_name, snapshot_date, power, role
-- FROM roster_snapshots
-- WHERE member_name IN ('WOLF', 'Ceje', 'ZETMA', 'Black Ruler', 'DonV4', 'MayorEric', 'Divid3', 'vn kenji', 'MadFluffy')
-- ORDER BY snapshot_date DESC, member_name;

-- Check membership changes after running:
-- This query shows joins between the two most recent snapshots
-- After backfill, these members should NOT appear as joins
