-- Restore ᵃⁿᵍBun's KP from Jan 12 manual entry
-- Jan 12 snapshot had: Bun = 34,178,000 KP
-- Current ROKstats shows: 4,160,270 KP (incomplete data)

UPDATE alliance_roster
SET kills = 34178000
WHERE name = 'ᵃⁿᵍBun';

-- Verify
SELECT name, power, kills FROM alliance_roster WHERE name = 'ᵃⁿᵍBun';
