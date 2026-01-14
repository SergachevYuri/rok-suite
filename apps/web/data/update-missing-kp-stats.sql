-- Update members with missing KP stats from ROKstats CSV
-- Data from PlayersRanking_20260114_081812.csv
-- Run this in Supabase SQL Editor

-- =============================================
-- MEMBERS WITH ᵃⁿᵍ PREFIX IN CSV
-- =============================================

-- NECO: 16.1M power, 4.69M KP
UPDATE alliance_roster SET
  kills = 4691422, power = 16147771, governor_id = 209858036
WHERE name IN ('NECO', 'ᵃⁿᵍNECO');

-- Sadgame: 14.2M power, 2.95M KP
UPDATE alliance_roster SET
  kills = 2954411, power = 14178307, governor_id = 209918464
WHERE name IN ('Sadgame', 'angSadgame');

-- Obi: 14.0M power, 3.33M KP
UPDATE alliance_roster SET
  kills = 3331303, power = 14016922, governor_id = 209868816
WHERE name IN ('Obi', 'ᵃⁿᵍObi');

-- Nev: 12.5M power, 1.99M KP
UPDATE alliance_roster SET
  kills = 1989377, power = 12499443, governor_id = 209900696
WHERE name LIKE '%Nev%' AND name NOT LIKE '%Never%';

-- FRODO: 13.4M power, 1.26M KP
UPDATE alliance_roster SET
  kills = 1264540, t4_kills = 126454, power = 13376808, governor_id = 206738505
WHERE name IN ('FRODO', 'ᵃⁿᵍ FRODO', 'ᵃⁿᵍFRODO');

-- =============================================
-- MEMBERS WITH OTHER PREFIXES IN CSV
-- =============================================

-- CHEZEE: 13.7M power, 3.02M KP (ᴿᵁ prefix)
UPDATE alliance_roster SET
  kills = 3017871, t4_kills = 297880, power = 13727879, governor_id = 209816068
WHERE name IN ('CHEZEE', 'ᴿᵁCHEZEE');

-- SkyLord: 12.2M power, 1.94M KP (ᴿᵁ prefix)
UPDATE alliance_roster SET
  kills = 1939126, t4_kills = 157889, t5_kills = 4422, power = 12179864, governor_id = 209636800
WHERE name IN ('SkyLord', 'ᴿᵁSkyLord');

-- Escipion: 11.4M power, 1.65M KP (кк prefix)
UPDATE alliance_roster SET
  kills = 1647660, t4_kills = 105330, t5_kills = 5021, power = 11410994, governor_id = 209800733
WHERE name IN ('Escipion', 'кк Escipion');

-- Zdrawe: 11.7M power, 368K KP (as Zdrawee)
UPDATE alliance_roster SET
  kills = 367733, t4_kills = 36728, power = 11703026, governor_id = 210374268
WHERE name IN ('Zdrawe', 'Zdrawee');

-- Furiaaa: 13.3M power, 11K KP (ᴵᴸ prefix)
UPDATE alliance_roster SET
  kills = 11197, power = 13307599, governor_id = 209820156
WHERE name IN ('Furiaaa', 'ᴵᴸFuriaaa');

-- bones: 13.4M power, 197K KP (ᶦˢ prefix)
UPDATE alliance_roster SET
  kills = 196762, power = 13429079, governor_id = 209833944
WHERE name IN ('bones', 'ᶦˢbones');

-- ShadowLunar: 11.0M power, 1.35M KP (屮 prefix)
UPDATE alliance_roster SET
  kills = 1352498, power = 10962226, governor_id = 210477608
WHERE name IN ('ShadowLunar', '屮ShadowLunar');

-- Mixuee: 14.1M power, 0 KP (ᴳᴸ prefix)
UPDATE alliance_roster SET
  power = 14149074, governor_id = 209674062
WHERE name IN ('Mixuee', 'ᴳᴸ Mixuee');

-- lady (as Lady Leanna): 11.4M power, 97K KP
UPDATE alliance_roster SET
  kills = 96810, t4_kills = 9681, power = 11375758, governor_id = 209912139
WHERE name IN ('lady', 'Lady Leanna');

-- =============================================
-- VERIFY UPDATES
-- =============================================
SELECT name, power, kills, t4_kills, t5_kills, governor_id
FROM alliance_roster
WHERE governor_id IS NOT NULL
  AND governor_id IN (
    209858036, 209918464, 209868816, 209900696, 206738505,
    209816068, 209636800, 209800733, 210374268, 209820156,
    209833944, 210477608, 209674062, 209912139
  )
ORDER BY power DESC;
