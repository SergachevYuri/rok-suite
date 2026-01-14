-- Migration: Merge Vaelstrom into Vael and fix name tag
-- Run this in your Supabase SQL Editor

-- Step 1: Find the records (only Vael and Vaelstrom, not Vaelwyn)
-- Check current state before making changes
SELECT id, name, power, kills, is_active, alternate_names, merged_into
FROM alliance_roster
WHERE name IN ('Vael', 'Vaelstrom')
ORDER BY created_at;

-- Step 2: Update Vael's name to include the ang tag
-- (Only run after verifying the records above)
UPDATE alliance_roster
SET name = 'ᵃⁿᵍVael'
WHERE name = 'Vael';

-- Step 3: Merge Vaelstrom into Vael
-- First, get the Vael record ID and store alternate names
DO $$
DECLARE
  vael_id uuid;
  vaelstrom_id uuid;
  vael_power int;
  vaelstrom_power int;
  vael_kills bigint;
  vaelstrom_kills bigint;
  vael_t4 bigint;
  vaelstrom_t4 bigint;
  vael_t5 bigint;
  vaelstrom_t5 bigint;
  vael_deads bigint;
  vaelstrom_deads bigint;
BEGIN
  -- Get Vael's record
  SELECT id, power, kills, t4_kills, t5_kills, deads INTO vael_id, vael_power, vael_kills, vael_t4, vael_t5, vael_deads
  FROM alliance_roster
  WHERE name = 'ᵃⁿᵍVael' AND merged_into IS NULL;

  -- Get Vaelstrom's record
  SELECT id, power, kills, t4_kills, t5_kills, deads INTO vaelstrom_id, vaelstrom_power, vaelstrom_kills, vaelstrom_t4, vaelstrom_t5, vaelstrom_deads
  FROM alliance_roster
  WHERE name = 'Vaelstrom' AND merged_into IS NULL;

  -- Only proceed if both records exist
  IF vael_id IS NOT NULL AND vaelstrom_id IS NOT NULL THEN
    -- Update Vael with merged stats and alternate names
    UPDATE alliance_roster
    SET
      power = GREATEST(vael_power, vaelstrom_power),
      kills = GREATEST(COALESCE(vael_kills, 0), COALESCE(vaelstrom_kills, 0)),
      t4_kills = GREATEST(COALESCE(vael_t4, 0), COALESCE(vaelstrom_t4, 0)),
      t5_kills = GREATEST(COALESCE(vael_t5, 0), COALESCE(vaelstrom_t5, 0)),
      deads = GREATEST(COALESCE(vael_deads, 0), COALESCE(vaelstrom_deads, 0)),
      alternate_names = array_append(COALESCE(alternate_names, '{}'), 'Vaelstrom')
    WHERE id = vael_id;

    -- Mark Vaelstrom as inactive and merged into Vael
    UPDATE alliance_roster
    SET
      is_active = false,
      merged_into = vael_id
    WHERE id = vaelstrom_id;

    RAISE NOTICE 'Successfully merged Vaelstrom into Vael';
  ELSE
    IF vael_id IS NULL THEN
      RAISE NOTICE 'Vael record not found';
    END IF;
    IF vaelstrom_id IS NULL THEN
      RAISE NOTICE 'Vaelstrom record not found (may already be merged)';
    END IF;
  END IF;
END $$;

-- Step 4: Update roster_snapshots to use the new tagged name
UPDATE roster_snapshots
SET member_name = 'ᵃⁿᵍVael'
WHERE member_name = 'Vael';

-- Step 5: Verify the merge (only Vael and Vaelstrom, not Vaelwyn)
SELECT id, name, power, kills, is_active, alternate_names, merged_into
FROM alliance_roster
WHERE name IN ('ᵃⁿᵍVael', 'Vael', 'Vaelstrom')
ORDER BY is_active DESC, created_at;

-- Also check snapshots
SELECT snapshot_date, member_name, power
FROM roster_snapshots
WHERE member_name IN ('ᵃⁿᵍVael', 'Vael')
ORDER BY snapshot_date DESC;
