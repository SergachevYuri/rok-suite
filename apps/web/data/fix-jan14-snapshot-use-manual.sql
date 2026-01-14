-- Fix Jan 14 snapshot: Use Jan 12 manual values where ROKstats is lower
-- Rule: Manual entry is source of truth when ROKstats has lower/incomplete data

-- Update Jan 14 snapshot to use Jan 12 values where ROKstats showed lower KP
UPDATE roster_snapshots s14
SET kills = s12.kills
FROM roster_snapshots s12
WHERE s14.member_name = s12.member_name
  AND s14.snapshot_date = '2026-01-14'
  AND s12.snapshot_date = '2026-01-12'
  AND s12.kills > s14.kills;  -- Only where manual entry was higher

-- Verify: All Jan 14 KP should now be >= Jan 12 KP
SELECT
  s12.member_name,
  s12.kills as jan12_kp,
  s14.kills as jan14_kp,
  s14.kills - s12.kills as kp_growth
FROM roster_snapshots s12
JOIN roster_snapshots s14 ON s12.member_name = s14.member_name
WHERE s12.snapshot_date = '2026-01-12'
  AND s14.snapshot_date = '2026-01-14'
  AND s12.kills > 0
ORDER BY s12.kills DESC;
