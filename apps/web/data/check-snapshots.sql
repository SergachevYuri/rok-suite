-- Check snapshot dates and counts
SELECT
  snapshot_date,
  COUNT(*) as member_count,
  SUM(CASE WHEN kills > 0 THEN 1 ELSE 0 END) as members_with_kp,
  MAX(created_at) as created_at
FROM roster_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC
LIMIT 10;
