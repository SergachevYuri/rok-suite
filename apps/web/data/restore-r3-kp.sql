-- Check Jan 12 values for R3 members with low KP
SELECT member_name, kills as jan12_kp
FROM roster_snapshots
WHERE snapshot_date = '2026-01-12'
  AND (
    member_name ILIKE '%bryanv%'
    OR member_name ILIKE '%shroud%'
    OR member_name ILIKE '%sunman%'
    OR member_name ILIKE '%alak%'
    OR member_name ILIKE '%nolie%'
    OR member_name ILIKE '%alcar%'
  )
ORDER BY kills DESC;

-- Restore from Jan 12 values (only if current is lower)

-- BryanV: 173K from Jan 12
UPDATE alliance_roster SET kills = 173000
WHERE name ILIKE '%bryanv%' AND name NOT LIKE '%_merged_%' AND (kills IS NULL OR kills < 173000);

-- Shroud: 1.2M from Jan 12
UPDATE alliance_roster SET kills = 1200000
WHERE name ILIKE '%shroud%' AND name NOT LIKE '%_merged_%' AND kills < 1200000;

-- Sunman: 778K from Jan 12
UPDATE alliance_roster SET kills = 778000
WHERE name ILIKE '%sunman%' AND name NOT LIKE '%_merged_%' AND kills < 778000;

-- Alak D: 700K from Jan 12
UPDATE alliance_roster SET kills = 700000
WHERE name ILIKE '%alak%' AND name NOT LIKE '%_merged_%' AND kills < 700000;

-- Nolie: 1.14M from Jan 12
UPDATE alliance_roster SET kills = 1138000
WHERE name ILIKE '%nolie%' AND name NOT LIKE '%_merged_%' AND kills < 1138000;

-- Alcar: 1.09M from Jan 12
UPDATE alliance_roster SET kills = 1088000
WHERE name = 'ᵃⁿᵍAlcar' AND kills < 1088000;

-- Verify
SELECT name, power, kills, role
FROM alliance_roster
WHERE name ILIKE '%bryanv%'
   OR name ILIKE '%shroud%'
   OR name ILIKE '%sunman%'
   OR name ILIKE '%alak%'
   OR name ILIKE '%nolie%'
   OR name = 'ᵃⁿᵍAlcar'
ORDER BY power DESC;
