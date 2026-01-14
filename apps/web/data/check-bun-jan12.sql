-- Check Bun's Jan 12 entry
SELECT member_name, power, kills
FROM roster_snapshots
WHERE snapshot_date = '2026-01-12'
  AND member_name ILIKE '%bun%'
ORDER BY power DESC;

-- Check current Bun entries in roster
SELECT name, power, kills, governor_id
FROM alliance_roster
WHERE name ILIKE '%bun%'
  AND is_active = true
  AND merged_into IS NULL
ORDER BY power DESC;
