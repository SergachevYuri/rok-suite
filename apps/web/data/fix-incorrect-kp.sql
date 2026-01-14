-- Fix incorrect KP assignments from overly broad ILIKE matches

-- Reset incorrect Bun matches (should only be ᵃⁿᵍBun)
UPDATE alliance_roster SET kills = 0 WHERE name = 'BabyBunny2nd';
UPDATE alliance_roster SET kills = 0 WHERE name = 'embuncute';
UPDATE alliance_roster SET kills = 0 WHERE name = 'Sweetbun';

-- Reset incorrect Jo matches (should only be ᵃⁿᵍJo and Jo)
UPDATE alliance_roster SET kills = 0 WHERE name = 'ᵃⁿᵍConejo';
UPDATE alliance_roster SET kills = 0 WHERE name = 'Djombe';
UPDATE alliance_roster SET kills = 0 WHERE name = 'Gojo B';
UPDATE alliance_roster SET kills = 0 WHERE name = 'joac jerec';
UPDATE alliance_roster SET kills = 0 WHERE name = 'Joeboo 123';
UPDATE alliance_roster SET kills = 0 WHERE name = 'JoiL1';
UPDATE alliance_roster SET kills = 0 WHERE name = 'ᴷᴷJokerbar';
UPDATE alliance_roster SET kills = 0 WHERE name = 'Titojo';

-- Now set correct values for the actual members

-- ᵃⁿᵍBun: Your Jan 12 value was 34.18M but current ROKstats shows 4.16M
-- Which is correct? If 34.18M was your manual entry, use that
-- UPDATE alliance_roster SET kills = 34178000 WHERE name = 'ᵃⁿᵍBun';

-- ᵃⁿᵍJo: 335K (correct)
-- Already set correctly

-- Jo: Check if this is a duplicate of ᵃⁿᵍJo or a different person
-- If same person, should be merged

-- Verify the fixes
SELECT name, power, kills
FROM alliance_roster
WHERE name IN (
  'BabyBunny2nd', 'embuncute', 'Sweetbun',
  'ᵃⁿᵍConejo', 'Djombe', 'Gojo B', 'joac jerec',
  'Joeboo 123', 'JoiL1', 'ᴷᴷJokerbar', 'Titojo',
  'ᵃⁿᵍBun', 'ᵃⁿᵍJo', 'Jo'
)
ORDER BY name;
