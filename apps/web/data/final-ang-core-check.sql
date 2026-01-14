-- Final check: All ANG core members KP status
-- Comparing current roster to Jan 12 snapshot

SELECT
  ar.name,
  ar.power,
  ar.kills as current_kp,
  ar.role,
  s12.kills as jan12_kp,
  CASE
    WHEN ar.kills IS NULL OR ar.kills = 0 THEN '✗ MISSING KP'
    WHEN s12.kills IS NOT NULL AND ar.kills < s12.kills THEN '⚠ LOWER THAN JAN 12'
    ELSE '✓ OK'
  END as status
FROM alliance_roster ar
LEFT JOIN roster_snapshots s12
  ON (ar.name = s12.member_name OR s12.member_name = REGEXP_REPLACE(ar.name, '^[ᵃⁿᵍᴬᴳ]+', ''))
  AND s12.snapshot_date = '2026-01-12'
WHERE ar.is_active = true
  AND ar.merged_into IS NULL
  AND ar.name NOT LIKE '%_merged_%'
  AND ar.role IN ('R5', 'R4', 'R3')
ORDER BY
  CASE ar.role WHEN 'R5' THEN 1 WHEN 'R4' THEN 2 WHEN 'R3' THEN 3 END,
  ar.power DESC;

-- Also check R2 officers
SELECT
  ar.name,
  ar.power,
  ar.kills as current_kp,
  ar.role,
  CASE
    WHEN ar.kills IS NULL OR ar.kills = 0 THEN '✗ MISSING KP'
    ELSE '✓ OK'
  END as status
FROM alliance_roster ar
WHERE ar.is_active = true
  AND ar.merged_into IS NULL
  AND ar.name NOT LIKE '%_merged_%'
  AND ar.role = 'R2'
ORDER BY ar.power DESC;

-- Summary: Count of members with missing KP by role
SELECT
  role,
  COUNT(*) as total,
  SUM(CASE WHEN kills IS NULL OR kills = 0 THEN 1 ELSE 0 END) as missing_kp,
  SUM(CASE WHEN kills > 0 THEN 1 ELSE 0 END) as has_kp
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND name NOT LIKE '%_merged_%'
  AND role IN ('R5', 'R4', 'R3', 'R2')
GROUP BY role
ORDER BY CASE role WHEN 'R5' THEN 1 WHEN 'R4' THEN 2 WHEN 'R3' THEN 3 WHEN 'R2' THEN 4 END;
