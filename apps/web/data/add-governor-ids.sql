-- Add governor_ids for core members
UPDATE alliance_roster SET governor_id = 209605052 WHERE name = 'ᵃⁿᵍVael';
UPDATE alliance_roster SET governor_id = 209837984 WHERE name = 'Dante';
UPDATE alliance_roster SET governor_id = 210415890 WHERE name = 'leander112';
UPDATE alliance_roster SET governor_id = 209759415 WHERE name = 'ALONE';
UPDATE alliance_roster SET governor_id = 210346417 WHERE name = 'Dark';

-- Verify
SELECT name, power, governor_id, role
FROM alliance_roster
WHERE name IN ('ᵃⁿᵍVael', 'Dante', 'leander112', 'ALONE', 'Dark');
