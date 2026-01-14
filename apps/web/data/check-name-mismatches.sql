-- Check Jan 12 snapshot for Jo, Soutz, TRAP
SELECT member_name, kills, power
FROM roster_snapshots
WHERE snapshot_date = '2026-01-12'
  AND (
    member_name ILIKE '%jo%'
    OR member_name ILIKE '%soutz%'
    OR member_name ILIKE '%trap%'
  )
ORDER BY member_name;

-- Check current roster for these members
SELECT name, kills, power
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND (
    name ILIKE '%jo%'
    OR name ILIKE '%soutz%'
    OR name ILIKE '%trap%'
  )
ORDER BY name;

-- Find ALL Jan 12 entries that don't have matching roster names
SELECT
  s12.member_name as snapshot_name,
  s12.kills as jan12_kp,
  ar.name as roster_name,
  ar.kills as roster_kp
FROM roster_snapshots s12
LEFT JOIN alliance_roster ar ON ar.name = s12.member_name
WHERE s12.snapshot_date = '2026-01-12'
  AND s12.kills > 0
  AND ar.name IS NULL
ORDER BY s12.kills DESC;
