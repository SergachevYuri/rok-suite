-- Restore KP data that was overwritten by the Jan 14 ROKstats import
-- Data source: Jan 12 snapshots (most recent good data)

-- =============================================
-- STEP 1: FIND ALL MEMBERS WHO LOST KP DATA
--         (Run this first to see who was affected)
-- =============================================
SELECT
  s12.member_name,
  s12.kills as jan12_kp,
  s14.kills as jan14_kp,
  s12.power as jan12_power
FROM roster_snapshots s12
JOIN roster_snapshots s14
  ON s12.member_name = s14.member_name
WHERE s12.snapshot_date = '2026-01-12'
  AND s14.snapshot_date = '2026-01-14'
  AND s12.kills > 0
  AND (s14.kills IS NULL OR s14.kills = 0)
ORDER BY s12.kills DESC;

-- =============================================
-- STEP 2: RESTORE ALL LOST KP FROM JAN 12 SNAPSHOT
--         (Restores data for everyone who lost it)
-- =============================================

-- Create a temp table with the Jan 12 data to restore
WITH lost_kp AS (
  SELECT s12.member_name, s12.kills as restore_kills
  FROM roster_snapshots s12
  JOIN roster_snapshots s14
    ON s12.member_name = s14.member_name
  WHERE s12.snapshot_date = '2026-01-12'
    AND s14.snapshot_date = '2026-01-14'
    AND s12.kills > 0
    AND (s14.kills IS NULL OR s14.kills = 0)
)
UPDATE alliance_roster ar
SET kills = lk.restore_kills
FROM lost_kp lk
WHERE (ar.name = lk.member_name OR ar.name ILIKE '%' || lk.member_name || '%')
  AND (ar.kills IS NULL OR ar.kills = 0);

-- =============================================
-- STEP 3: VERIFY THE RESTORE
-- =============================================
SELECT name, power, kills, t4_kills, t5_kills
FROM alliance_roster
WHERE name IN ('Jo', 'ᵃⁿᵍJo', 'Wallerun I')
   OR name ILIKE '%jo%' AND LENGTH(name) <= 10
ORDER BY name;

-- =============================================
-- STEP 4: CHECK CURRENT STATE OF ALL MEMBERS
--         WHO HAD KP ON JAN 12
-- =============================================
SELECT
  ar.name,
  ar.kills as current_kp,
  s12.kills as jan12_kp,
  CASE WHEN ar.kills >= s12.kills THEN '✓ OK' ELSE '✗ NEEDS RESTORE' END as status
FROM roster_snapshots s12
JOIN alliance_roster ar ON ar.name = s12.member_name
WHERE s12.snapshot_date = '2026-01-12'
  AND s12.kills > 0
ORDER BY s12.kills DESC;
