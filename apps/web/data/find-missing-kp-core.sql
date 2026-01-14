-- Find ANG core members with missing KP (kills = 0 or NULL)
-- And check if they have data in Jan 12 snapshot

SELECT
  ar.name,
  ar.power,
  ar.kills as current_kp,
  ar.role,
  s12.kills as jan12_snapshot_kp
FROM alliance_roster ar
LEFT JOIN roster_snapshots s12
  ON ar.name = s12.member_name
  AND s12.snapshot_date = '2026-01-12'
WHERE ar.is_active = true
  AND ar.merged_into IS NULL
  AND (ar.kills IS NULL OR ar.kills = 0)
  AND ar.power > 5000000  -- Focus on active players with decent power
ORDER BY ar.power DESC;

-- Also check specific names you mentioned
SELECT
  ar.name,
  ar.power,
  ar.kills as current_kp,
  s12.kills as jan12_kp,
  CASE
    WHEN ar.kills > 0 THEN '✓ Has KP'
    WHEN s12.kills > 0 THEN '⚠ Needs restore from Jan 12'
    ELSE '✗ No KP data found'
  END as status
FROM alliance_roster ar
LEFT JOIN roster_snapshots s12
  ON ar.name = s12.member_name
  AND s12.snapshot_date = '2026-01-12'
WHERE ar.is_active = true
  AND ar.merged_into IS NULL
  AND (
    ar.name ILIKE '%neco%'
    OR ar.name ILIKE '%soutz%'
    OR ar.name ILIKE '%obi%'
    OR ar.name ILIKE '%sadgame%'
    OR ar.name ILIKE '%draken%'
    OR ar.name ILIKE '%sonk8%'
    OR ar.name ILIKE '%alcar%'
    OR ar.name ILIKE '%trap%'
    OR ar.name ILIKE '%milos%'
    OR ar.name ILIKE '%jo%'
    OR ar.name ILIKE '%wallerun%'
  )
ORDER BY ar.name;
