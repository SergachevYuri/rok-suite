-- Check all ANG core members for missing KP
-- Based on angmar-og.csv list

SELECT name, power, kills, role
FROM alliance_roster
WHERE is_active = true
  AND merged_into IS NULL
  AND (
    -- Check all the core members you mentioned and from the CSV
    name ILIKE '%neco%' OR name ILIKE '%soutz%' OR name ILIKE '%obi%'
    OR name ILIKE '%sadgame%' OR name ILIKE '%draken%' OR name ILIKE '%sonk8%'
    OR name ILIKE '%alcar%' OR name ILIKE '%chezee%' OR name ILIKE '%nev%'
    OR name ILIKE '%trap%' OR name ILIKE '%milos%' OR name ILIKE '%bryanv%'
    OR name ILIKE '%nolie%' OR name ILIKE '%dante%' OR name ILIKE '%alak%'
    OR name ILIKE '%sunman%' OR name ILIKE '%shroud%' OR name ILIKE '%stalinggard%'
    OR name ILIKE '%armstrong%' OR name ILIKE '%queen of%'
    -- R4s
    OR name ILIKE '%fluffy%' OR name ILIKE '%sysstem%' OR name ILIKE '%suntzu%'
    OR name ILIKE '%funny%' OR name ILIKE '%bbqsge%' OR name ILIKE '%vael%'
    OR name ILIKE '%cain%'
    -- Other core members
    OR name ILIKE '%winkvk%' OR name ILIKE '%furiaaa%' OR name ILIKE '%hungvv%'
    OR name ILIKE '%mixuee%' OR name ILIKE '%bones%' OR name ILIKE '%shadowlunar%'
    OR name ILIKE '%bakr%' OR name ILIKE '%soc%' OR name ILIKE '%sóc%'
    OR name ILIKE '%dark%' OR name ILIKE '%leander%' OR name ILIKE '%samxinh%'
    OR name ILIKE '%wallerun%' OR name ILIKE '%alone%'
    -- R1 core
    OR name ILIKE '%bbyvix%' OR name ILIKE '%bun%' OR name ILIKE '%cloud%'
    OR name ILIKE '%raijin%' OR name ILIKE '%dooffy%' OR name ILIKE '%calca%'
    OR name ILIKE '%giahuy%' OR name ILIKE '%binganh%' OR name ILIKE '%bear%'
    OR name ILIKE '%fnduke%' OR name ILIKE '%loli%' OR name ILIKE '%turan%'
    OR name ILIKE '%bao%' OR name ILIKE '%shorty%' OR name ILIKE '%unlimit%'
    OR name ILIKE '%fluffy jester%' OR name ILIKE '%frodo%' OR name ILIKE '%panh%'
    OR name ILIKE '%gouverneur%' OR name ILIKE '%clayfm%' OR name ILIKE '%fluffy lover%'
    OR name ILIKE '%kailey%' OR name ILIKE '%glordmai%' OR name ILIKE '%anh tuan%'
    OR name ILIKE '%gund%' OR name ILIKE '%zdrawe%' OR name ILIKE '%orzrzi%'
    OR name ILIKE '%zaebali%' OR name ILIKE '%komvd%' OR name ILIKE '%kenji%'
    OR name ILIKE '%lukes%' OR name ILIKE '%lady%' OR name ILIKE '%hoangg%'
    OR name ILIKE '%ssoren%' OR name ILIKE '%notor%' OR name ILIKE '%tgl%'
    OR name ILIKE '%dela steven%' OR name ILIKE '%bung%' OR name ILIKE '%bryan%'
    OR name ILIKE '%keter%' OR name ILIKE '%dao 93%' OR name ILIKE '%đảo%'
    OR name ILIKE '%escipion%' OR name ILIKE '%stultitia%' OR name ILIKE '%sungod%'
    OR name ILIKE '%giulia%' OR name ILIKE '%rudues%' OR name ILIKE '%gladiador%'
    OR name ILIKE '%yuckfou%' OR name ILIKE '%xtelli%' OR name ILIKE '%bysel%'
    OR name ILIKE '%mihawk%' OR name ILIKE '%cbc%' OR name ILIKE '%nhi%'
    OR name ILIKE '%sauvole%' OR name ILIKE '%suet%' OR name ILIKE '%ronka%'
    OR name ILIKE '%ронка%' OR name ILIKE '%cowl%' OR name ILIKE '%capitan%'
    OR name ILIKE '%akka%' OR name ILIKE '%yigitl%' OR name ILIKE '%reeeldid%'
    OR name ILIKE '%batussai%' OR name ILIKE '%adolf%' OR name ILIKE '%ksa 511%'
    OR name ILIKE '%kapibara%' OR name ILIKE '%deputatov%' OR name ILIKE '%kousminas%'
    OR name ILIKE '%god chosen%' OR name ILIKE '%sirelli%' OR name ILIKE '%stephen%'
    OR name ILIKE '%kether%' OR name ILIKE '%thegoat%' OR name ILIKE '%hoangred%'
    OR name ILIKE '%casper%' OR name ILIKE '%aminvn%' OR name ILIKE '%skylord%'
    OR name ILIKE '%jo%' OR name ILIKE '%ghost%' OR name ILIKE '%세계평화%'
    OR name ILIKE '%モニタリング%'
  )
ORDER BY
  CASE WHEN kills IS NULL OR kills = 0 THEN 0 ELSE 1 END,  -- Missing KP first
  power DESC;
