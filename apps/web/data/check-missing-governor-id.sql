-- Check core ANG members (R3+) missing governor_id
SELECT name, power, kills, role, governor_id
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND name NOT LIKE '%_merged_%'
  AND role IN ('R5', 'R4', 'R3', 'R2')
  AND governor_id IS NULL
ORDER BY
  CASE role WHEN 'R5' THEN 1 WHEN 'R4' THEN 2 WHEN 'R3' THEN 3 WHEN 'R2' THEN 4 END,
  power DESC;

-- Summary
SELECT
  role,
  COUNT(*) as total,
  SUM(CASE WHEN governor_id IS NULL THEN 1 ELSE 0 END) as missing_gov_id,
  SUM(CASE WHEN governor_id IS NOT NULL THEN 1 ELSE 0 END) as has_gov_id
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND name NOT LIKE '%_merged_%'
  AND role IN ('R5', 'R4', 'R3', 'R2')
GROUP BY role
ORDER BY CASE role WHEN 'R5' THEN 1 WHEN 'R4' THEN 2 WHEN 'R3' THEN 3 WHEN 'R2' THEN 4 END;
