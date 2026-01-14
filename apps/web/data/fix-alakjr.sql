-- Fix incorrect KP for ᵃⁿᵍALAKJR (got 700K from ILIKE '%alak%' match)
UPDATE alliance_roster SET kills = 0
WHERE name = 'ᵃⁿᵍALAKJR';

-- Verify
SELECT name, power, kills FROM alliance_roster WHERE name = 'ᵃⁿᵍALAKJR';
