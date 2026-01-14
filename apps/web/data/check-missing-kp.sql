-- Check for missing KP data in core ANG members
-- Run these queries in Supabase SQL Editor

-- =============================================
-- 1. CHECK JO AND WALLERUN SPECIFICALLY
-- =============================================
SELECT
  id, name, power, kills, t4_kills, t5_kills, deads,
  governor_id, is_active, created_at, updated_at
FROM alliance_roster
WHERE name ILIKE '%jo%' OR name ILIKE '%wallerun%'
ORDER BY name;

-- =============================================
-- 2. CHECK ROSTER_SNAPSHOTS FOR JO AND WALLERUN
--    (This shows if KP was ever recorded historically)
-- =============================================
SELECT
  snapshot_date, member_name, power, kills, t4_kills, t5_kills
FROM roster_snapshots
WHERE member_name ILIKE '%jo%' OR member_name ILIKE '%wallerun%'
ORDER BY member_name, snapshot_date DESC;

-- =============================================
-- 3. ALL CORE ANG MEMBERS WITH BLANK/ZERO KP
--    (Based on angmar-og.csv core member list)
-- =============================================
SELECT
  name, power, kills, t4_kills, t5_kills, deads, governor_id, role
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND (kills IS NULL OR kills = 0)
  AND (
    -- Row 2-3 core members
    name ILIKE '%thegoathimself%' OR name ILIKE '%unlimit%' OR name ILIKE '%nev%'
    OR name ILIKE '%wallerun%' OR name ILIKE '%bun%' OR name ILIKE '%frodo%'
    OR name ILIKE '%bryanv%' OR name ILIKE '%ksa 511%'
    -- Row 4-5 core members
    OR name ILIKE '%raijin%' OR name ILIKE '%gouverneur%' OR name ILIKE '%nolie%'
    OR name ILIKE '%alone%' OR name ILIKE '%calca%' OR name ILIKE '%fluffy lover%'
    OR name ILIKE '%jo%' OR name ILIKE '%glordmai%'
    -- Row 6-7 core members
    OR name ILIKE '%binganh%' OR name ILIKE '%biNganHoa%' OR name ILIKE '%anh tuan%'
    OR name ILIKE '%dante%' OR name ILIKE '%sirelli%' OR name ILIKE '%fnduke%'
    OR name ILIKE '%zdrawe%' OR name ILIKE '%alak%' OR name ILIKE '%stephen%'
    -- Row 8-9 core members
    OR name ILIKE '%fluffy jester%' OR name ILIKE '%kenji%' OR name ILIKE '%shroud%'
    OR name ILIKE '%lukes%' OR name ILIKE '%clayfm%' OR name ILIKE '%lady%'
    OR name ILIKE '%leander%' OR name ILIKE '%tgl%'
    -- Row 10-11 core members
    OR name ILIKE '%skylord%' OR name ILIKE '%keter%' OR name ILIKE '%dao 93%'
    OR name ILIKE '%đảo%' OR name ILIKE '%giulia%' OR name ILIKE '%kailey%'
    OR name ILIKE '%xtelli%' OR name ILIKE '%hoangg%' OR name ILIKE '%rudues%'
    -- Row 12-14 core members
    OR name ILIKE '%zaebali%' OR name ILIKE '%cbc%' OR name ILIKE '%ghost%'
    OR name ILIKE '%komvd%' OR name ILIKE '%sauvole%' OR name ILIKE '%obi%'
    OR name ILIKE '%suet%' OR name ILIKE '%notor%' OR name ILIKE '%reeeldid%'
    OR name ILIKE '%yuckfou%' OR name ILIKE '%akka%'
    -- Row 15-17 core members
    OR name ILIKE '%bryan%' OR name ILIKE '%adolf%' OR name ILIKE '%sonk8%'
    OR name ILIKE '%batussai%' OR name ILIKE '%sungod%' OR name ILIKE '%winkvk%'
    OR name ILIKE '%armstrong%' OR name ILIKE '%hungvv%' OR name ILIKE '%milos%'
    -- Row 18-21 core members
    OR name ILIKE '%nhi%' OR name ILIKE '%bbyvix%' OR name ILIKE '%ssoren%'
    OR name ILIKE '%capitan%' OR name ILIKE '%soc%' OR name ILIKE '%sóc%'
    OR name ILIKE '%yigitl%' OR name ILIKE '%bakr%' OR name ILIKE '%mihawk%'
    OR name ILIKE '%cloud%' OR name ILIKE '%neco%' OR name ILIKE '%orzrzi%'
    -- Row 22-25 core members
    OR name ILIKE '%dooffy%' OR name ILIKE '%doofy%' OR name ILIKE '%sadgame%'
    OR name ILIKE '%turan%' OR name ILIKE '%giahuy%' OR name ILIKE '%draken%'
    OR name ILIKE '%ронка%' OR name ILIKE '%ronka%' OR name ILIKE '%bear%'
    OR name ILIKE '%alcar%' OR name ILIKE '%cowl%' OR name ILIKE '%trap%'
    OR name ILIKE '%queen of%'  OR name ILIKE '%stalinggard%'
  )
ORDER BY power DESC;

-- =============================================
-- 4. SIMPLER VIEW: ALL ACTIVE MEMBERS WITH NO KP
-- =============================================
SELECT
  name, power, kills, role,
  CASE
    WHEN role IN ('R4', 'R5') THEN 'LEADERSHIP'
    WHEN role = 'R3' THEN 'OFFICER'
    ELSE 'MEMBER'
  END as rank_category
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND (kills IS NULL OR kills = 0)
  AND power > 0  -- Has some activity
ORDER BY
  CASE role
    WHEN 'R5' THEN 1
    WHEN 'R4' THEN 2
    WHEN 'R3' THEN 3
    WHEN 'R2' THEN 4
    ELSE 5
  END,
  power DESC;

-- =============================================
-- 5. CHECK IF ANY SNAPSHOTS EXIST AT ALL
--    (To understand data history)
-- =============================================
SELECT
  snapshot_date,
  COUNT(*) as member_count,
  SUM(CASE WHEN kills > 0 THEN 1 ELSE 0 END) as members_with_kp
FROM roster_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC
LIMIT 10;
