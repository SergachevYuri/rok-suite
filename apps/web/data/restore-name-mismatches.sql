-- Restore KP for members whose names changed (added ᵃⁿᵍ tag)
-- These have KP in Jan 12 snapshot but names don't match current roster

-- Bun -> ᵃⁿᵍBun (34.18M KP)
UPDATE alliance_roster SET kills = 34178000
WHERE name ILIKE '%bun%' AND (kills IS NULL OR kills = 0);

-- Raijin -> ᵃⁿᵍRaijin (27.35M KP)
UPDATE alliance_roster SET kills = 27345000
WHERE name ILIKE '%raijin%' AND (kills IS NULL OR kills = 0);

-- BBQSGE (16.84M KP)
UPDATE alliance_roster SET kills = 16842000
WHERE name ILIKE '%bbqsge%' AND (kills IS NULL OR kills = 0);

-- BáOo (14M KP)
UPDATE alliance_roster SET kills = 14000000
WHERE name ILIKE '%bao%' AND name NOT ILIKE '%bung%' AND (kills IS NULL OR kills = 0);

-- Calca -> ᵃⁿᵍCalca (7.83M KP)
UPDATE alliance_roster SET kills = 7826000
WHERE name ILIKE '%calca%' AND (kills IS NULL OR kills = 0);

-- Cain (4.82M KP)
UPDATE alliance_roster SET kills = 4819000
WHERE name ILIKE '%cain%' AND (kills IS NULL OR kills = 0);

-- Nev✖ (3.06M KP)
UPDATE alliance_roster SET kills = 3060000
WHERE name ILIKE '%nev%' AND name NOT ILIKE '%never%' AND (kills IS NULL OR kills = 0);

-- Sadgame (863K KP) - Note: angSadgame already has 2.95M, this might be old data
-- Only update if current is 0
UPDATE alliance_roster SET kills = 863000
WHERE name ILIKE '%sadgame%' AND (kills IS NULL OR kills = 0);

-- Now check for Jo, Soutz, TRAP specifically
-- Jo (335K from earlier)
UPDATE alliance_roster SET kills = 335000
WHERE name ILIKE '%jo%' AND LENGTH(name) <= 10 AND (kills IS NULL OR kills = 0);

-- Soutz (8.52M from Jan 12)
UPDATE alliance_roster SET kills = 8522000
WHERE name ILIKE '%soutz%' AND (kills IS NULL OR kills = 0);

-- TRAP (249K from Jan 12)
UPDATE alliance_roster SET kills = 249000
WHERE name ILIKE '%trap%' AND (kills IS NULL OR kills = 0);

-- =============================================
-- VERIFY RESTORES
-- =============================================
SELECT name, power, kills
FROM alliance_roster
WHERE name ILIKE '%bun%'
   OR name ILIKE '%raijin%'
   OR name ILIKE '%bbqsge%'
   OR name ILIKE '%bao%'
   OR name ILIKE '%calca%'
   OR name ILIKE '%cain%'
   OR name ILIKE '%nev%'
   OR name ILIKE '%jo%'
   OR name ILIKE '%soutz%'
   OR name ILIKE '%trap%'
ORDER BY name;
