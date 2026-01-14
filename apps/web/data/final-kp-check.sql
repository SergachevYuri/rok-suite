-- Final comprehensive check: All ANG core members with 0 or NULL KP
-- These need manual restoration

SELECT name, power, kills, role
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND name NOT LIKE '%_merged_%'
  AND (kills IS NULL OR kills = 0)
  AND power > 5000000  -- Focus on active players
  AND (
    -- Leadership
    role IN ('R5', 'R4', 'R3', 'R2')
    -- Or known ANG names
    OR name ILIKE '%ᵃⁿᵍ%'
    OR name ILIKE '%ang%'
  )
ORDER BY power DESC;

-- Also show all R3+ members regardless of KP to verify
SELECT name, power, kills, role
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND name NOT LIKE '%_merged_%'
  AND role IN ('R5', 'R4', 'R3')
ORDER BY
  CASE role WHEN 'R5' THEN 1 WHEN 'R4' THEN 2 WHEN 'R3' THEN 3 END,
  power DESC;
