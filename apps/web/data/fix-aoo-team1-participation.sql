-- Fix AoO Team 1 participation data
-- Based on actual attendance vs assigned roster
--
-- Team 1 Roster (30 assigned starters from aoo_team-1.csv):
-- Vael, Suntzu, Fluffy, Funny, Fluffy Queen, SkyLord, Dooffy, CAPITAN, Zdrawe,
-- Ронка (Ronka), casper, Xtelli, winkvk, unlimit, Batussai, BbyVix, GLordMai,
-- STALINGGARD, lady, ShadowLunar, Bryan, GiaHuy, Fluffy Jester, Bun, Calca,
-- Obi, bear, cloud, FnDuke, BiNganHoa
--
-- Actual attendees (24): fluffy, suntzu, bun, fluffy jester, funny, calca,
-- fluffy queen, cain, cloud, casper, obi, skylord, zdrawe, vael, bbyvix,
-- ronka, shadowlunar, sungod, capitan, fnduke, bbqsge, unlimit, shroud, xtelli
--
-- No-shows (10 starters assigned but didn't attend):
-- Dooffy, winkvk, Batussai, GLordMai, STALINGGARD, lady, Bryan, GiaHuy, bear, BiNganHoa
--
-- Substitute fill-ins (4 who were NOT assigned but DID attend):
-- Cain, sungod, BBQSGE, Shroud

-- Step 1: Update no-shows to participated = false
-- (using exact names from alliance_roster)
UPDATE event_participation
SET participated = false
WHERE event_type = 'aoo'
  AND team = 'Team 1'
  AND member_name IN (
    'Dooffy',
    'winkvk',
    'Batussai',
    'GLordMai',
    'STALINGGARD',
    'lady',
    'Bryan',
    'GiaHuy',
    'bear',
    'BiNganHoa'
  );

-- Step 2: Insert substitute players who participated
-- (they weren't originally assigned but filled in)
-- Note: Using the most recent Team 1 event date
-- First check the event date:
-- SELECT DISTINCT event_date FROM event_participation WHERE event_type = 'aoo' AND team = 'Team 1' ORDER BY event_date DESC LIMIT 1;

-- Insert substitutes (replace 'YYYY-MM-DD' with actual event date)
INSERT INTO event_participation (member_name, event_type, event_date, team, participated)
VALUES
  ('Cain', 'aoo', (SELECT MAX(event_date) FROM event_participation WHERE event_type = 'aoo' AND team = 'Team 1'), 'Team 1', true),
  ('sungod', 'aoo', (SELECT MAX(event_date) FROM event_participation WHERE event_type = 'aoo' AND team = 'Team 1'), 'Team 1', true),
  ('BBQSGE', 'aoo', (SELECT MAX(event_date) FROM event_participation WHERE event_type = 'aoo' AND team = 'Team 1'), 'Team 1', true),
  ('Shroud', 'aoo', (SELECT MAX(event_date) FROM event_participation WHERE event_type = 'aoo' AND team = 'Team 1'), 'Team 1', true)
ON CONFLICT (member_name, event_type, event_date)
DO UPDATE SET team = 'Team 1', participated = true;

-- Verification queries:
-- Check no-shows are marked correctly:
-- SELECT member_name, participated FROM event_participation WHERE event_type = 'aoo' AND team = 'Team 1' AND participated = false;

-- Check participation stats:
-- SELECT
--   COUNT(*) as total_assigned,
--   SUM(CASE WHEN participated THEN 1 ELSE 0 END) as actually_participated,
--   ROUND(100.0 * SUM(CASE WHEN participated THEN 1 ELSE 0 END) / COUNT(*), 1) as participation_rate
-- FROM event_participation
-- WHERE event_type = 'aoo' AND team = 'Team 1';
-- Expected: 34 assigned (30 original + 4 subs), 24 participated = 70.6% rate
