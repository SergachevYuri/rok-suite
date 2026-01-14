-- Update members with MISSING KP stats from ROKstats CSV
-- Data from PlayersRanking_20260114_081812.csv (2026-01-14)
-- IMPORTANT: Only updates if kills is NULL or 0 to preserve existing data!
-- Run this in Supabase SQL Editor

-- =============================================
-- CORE MEMBERS (R4/R5 and key R3s)
-- Only update if kills is missing (NULL or 0)
-- =============================================

-- Fluffy: 76M power, 33.2M KP
UPDATE alliance_roster SET
  kills = 33152493, t4_kills = 2522009, t5_kills = 183369, deads = 29424,
  governor_id = 210387545
WHERE name IN ('Fluffy', 'ᵃⁿᵍFluffy') AND (kills IS NULL OR kills = 0);

-- Sysstem: 74.6M power, 2.3M KP
UPDATE alliance_roster SET
  kills = 2291299, t4_kills = 0, t5_kills = 27310, deads = 13685,
  governor_id = 210415804
WHERE name IN ('Sysstem', 'ᵃⁿᵍSysstem') AND (kills IS NULL OR kills = 0);

-- Suntzu: 54.3M power, 1.9M KP
UPDATE alliance_roster SET
  kills = 1881500, t4_kills = 170829, t5_kills = 7993, deads = 0,
  governor_id = 210397851
WHERE name IN ('Suntzu', 'ᵃⁿᵍSuntzu') AND (kills IS NULL OR kills = 0);

-- Funny: 20.5M power, 2.9M KP
UPDATE alliance_roster SET
  kills = 2949643, t4_kills = 262688, t5_kills = 13996, deads = 0,
  governor_id = 210742295
WHERE name IN ('Funny', 'ᵃⁿᵍFunny') AND (kills IS NULL OR kills = 0);

-- Fluffy Queen: 18.3M power, 3.1M KP
UPDATE alliance_roster SET
  kills = 3061372, t4_kills = 297084, t5_kills = 0, deads = 0,
  governor_id = 209848954
WHERE name = 'Fluffy Queen' AND (kills IS NULL OR kills = 0);

-- BBQSGE: 17.8M power, 6.9M KP
UPDATE alliance_roster SET
  kills = 6890494, t4_kills = 390640, t5_kills = 14419, deads = 25023,
  governor_id = 210400254
WHERE name IN ('BBQSGE', 'ᵃⁿᵍBBQSGE') AND (kills IS NULL OR kills = 0);

-- Cain: 10.1M power, 1.9M KP
UPDATE alliance_roster SET
  kills = 1898393, t4_kills = 53523, t5_kills = 0, deads = 145378,
  governor_id = 210423049
WHERE name IN ('Cain', 'ᵃⁿᵍCain') AND (kills IS NULL OR kills = 0);

-- =============================================
-- R3 MEMBERS
-- =============================================

-- NECO: 16.1M power, 4.69M KP
UPDATE alliance_roster SET
  kills = 4691422, governor_id = 209858036
WHERE name IN ('NECO', 'ᵃⁿᵍNECO') AND (kills IS NULL OR kills = 0);

-- Draken: 15.6M power, 227K KP
UPDATE alliance_roster SET
  kills = 227300, t4_kills = 22730, t5_kills = 0, deads = 0,
  governor_id = 209839223
WHERE name IN ('Draken', 'ᵃⁿᵍDraken') AND (kills IS NULL OR kills = 0);

-- Sadgame: 14.2M power, 2.95M KP
UPDATE alliance_roster SET
  kills = 2954411, governor_id = 209918464
WHERE name IN ('Sadgame', 'angSadgame') AND (kills IS NULL OR kills = 0);

-- Obi: 14.0M power, 3.33M KP
UPDATE alliance_roster SET
  kills = 3331303, governor_id = 209868816
WHERE name IN ('Obi', 'ᵃⁿᵍObi') AND (kills IS NULL OR kills = 0);

-- Sonk8: 16.2M power, 245K KP
UPDATE alliance_roster SET
  kills = 244650, t4_kills = 24465, t5_kills = 0, deads = 0,
  governor_id = 209834208
WHERE name IN ('Sonk8', 'ᵃⁿᵍSonk8') AND (kills IS NULL OR kills = 0);

-- Soutz: 15M power, 0 KP (no update needed if 0)
UPDATE alliance_roster SET
  governor_id = 210415536
WHERE name IN ('Soutz', 'ᵃⁿᵍSoutz');

-- Alcar: 10.8M power, 99K KP
UPDATE alliance_roster SET
  kills = 98600, t4_kills = 9860, t5_kills = 0, deads = 0,
  governor_id = 209914982
WHERE name IN ('Alcar', 'ᵃⁿᵍAlcar') AND (kills IS NULL OR kills = 0);

-- Queen of Chaos: 11.9M power, 754K KP
UPDATE alliance_roster SET
  kills = 753872, t4_kills = 75202, t5_kills = 0, deads = 0,
  governor_id = 210684673
WHERE name = 'Queen of Chaos' AND (kills IS NULL OR kills = 0);

-- Nev: 12.5M power, 1.99M KP
UPDATE alliance_roster SET
  kills = 1989377, governor_id = 209900696
WHERE name LIKE '%Nev%' AND name NOT LIKE '%Never%' AND (kills IS NULL OR kills = 0);

-- TRAP: 11.8M power, 0 KP
UPDATE alliance_roster SET
  governor_id = 210414957
WHERE name IN ('TRAP', 'ᵃⁿᵍTRAP');

-- Milos: 11.2M power, 960K KP
UPDATE alliance_roster SET
  kills = 960380, t4_kills = 76634, t5_kills = 9702, deads = 0,
  governor_id = 209838675
WHERE name IN ('Milos', 'ᵃⁿᵍMilos') AND (kills IS NULL OR kills = 0);

-- BryanV: 10.4M power, 0 KP
UPDATE alliance_roster SET
  governor_id = 210395444
WHERE name IN ('BryanV', 'ᵃⁿᵍBryanV');

-- Nolie: 9.5M power, 343K KP
UPDATE alliance_roster SET
  kills = 343417, t4_kills = 15462, t5_kills = 0, deads = 18212,
  governor_id = 210425059
WHERE name IN ('Nolie', 'ᵃⁿᵍNolie') AND (kills IS NULL OR kills = 0);

-- Jo: 8.2M power, 0 KP
UPDATE alliance_roster SET
  governor_id = 210428169
WHERE name IN ('Jo', 'ᵃⁿᵍJo');

-- Sunman: 8.7M power, 16K KP
UPDATE alliance_roster SET
  kills = 16170, t4_kills = 1617, t5_kills = 0, deads = 0,
  governor_id = 210412435
WHERE name IN ('Sunman', 'ᵃⁿᵍSunman') AND (kills IS NULL OR kills = 0);

-- Shroud: 5.9M power, 10 KP
UPDATE alliance_roster SET
  kills = 10, t4_kills = 1, t5_kills = 0, deads = 0,
  governor_id = 210410765
WHERE name IN ('Shroud', 'ᵃⁿᵍShroud') AND (kills IS NULL OR kills = 0);

-- =============================================
-- R2 MEMBERS
-- =============================================

-- Furiaaa: 13.3M power, 11K KP (ᴵᴸ prefix)
UPDATE alliance_roster SET
  kills = 11197, governor_id = 209820156
WHERE name IN ('Furiaaa', 'ᴵᴸFuriaaa') AND (kills IS NULL OR kills = 0);

-- bones: 13.4M power, 197K KP (ᶦˢ prefix)
UPDATE alliance_roster SET
  kills = 196762, governor_id = 209833944
WHERE name IN ('bones', 'ᶦˢbones') AND (kills IS NULL OR kills = 0);

-- ShadowLunar: 11.0M power, 1.35M KP (屮 prefix)
UPDATE alliance_roster SET
  kills = 1352498, governor_id = 210477608
WHERE name IN ('ShadowLunar', '屮ShadowLunar') AND (kills IS NULL OR kills = 0);

-- =============================================
-- R1 MEMBERS (HIGH POWER)
-- =============================================

-- BbyVix: 30.6M power, 2.1M KP
UPDATE alliance_roster SET
  kills = 2127190, t4_kills = 153213, t5_kills = 29753, deads = 0,
  governor_id = 209750838
WHERE name IN ('BbyVix', 'ᵃⁿᵍBbyVix') AND (kills IS NULL OR kills = 0);

-- Bun: 23M power, 4.2M KP
UPDATE alliance_roster SET
  kills = 4160270, t4_kills = 350867, t5_kills = 32580, deads = 0,
  governor_id = 209833497
WHERE name IN ('Bun', 'ᵃⁿᵍBun') AND (kills IS NULL OR kills = 0);

-- Raijin: 17.2M power, 4.4M KP
UPDATE alliance_roster SET
  kills = 4388860, t4_kills = 395302, t5_kills = 19087, deads = 783,
  governor_id = 210417810
WHERE name IN ('Raijin', 'ᵃⁿᵍRaijin') AND (kills IS NULL OR kills = 0);

-- Calca: 16.2M power, 3.1M KP
UPDATE alliance_roster SET
  kills = 3053222, t4_kills = 275484, t5_kills = 7111, deads = 32551,
  governor_id = 210416938
WHERE name IN ('Calca', 'ᵃⁿᵍCalca') AND (kills IS NULL OR kills = 0);

-- BáOo: 13.9M power, 3.9M KP
UPDATE alliance_roster SET
  kills = 3929048, t4_kills = 159486, t5_kills = 3206, deads = 116331,
  governor_id = 210390745
WHERE name IN ('BáOo', 'ᵃⁿᵍBáOo') AND (kills IS NULL OR kills = 0);

-- Fluffy Jester: 13.6M power, 1.8M KP
UPDATE alliance_roster SET
  kills = 1790453, t4_kills = 165875, t5_kills = 0, deads = 0,
  governor_id = 209877866
WHERE name = 'Fluffy Jester' AND (kills IS NULL OR kills = 0);

-- FRODO: 13.4M power, 1.26M KP
UPDATE alliance_roster SET
  kills = 1264540, t4_kills = 126454, t5_kills = 0, deads = 0,
  governor_id = 206738505
WHERE name IN ('FRODO', 'ᵃⁿᵍ FRODO', 'ᵃⁿᵍFRODO') AND (kills IS NULL OR kills = 0);

-- Fluffy Lover: 12.6M power, 2.4M KP
UPDATE alliance_roster SET
  kills = 2412996, t4_kills = 184916, t5_kills = 8662, deads = 0,
  governor_id = 210377285
WHERE name = 'Fluffy Lover' AND (kills IS NULL OR kills = 0);

-- Zaebali: 12.8M power, 3.5M KP
UPDATE alliance_roster SET
  kills = 3493061, t4_kills = 279739, t5_kills = 23415, deads = 0,
  governor_id = 209862333
WHERE name IN ('Zaebali', 'ᵃⁿᵍZaebali') AND (kills IS NULL OR kills = 0);

-- unlimit: 13.5M power, 758K KP
UPDATE alliance_roster SET
  kills = 757834, t4_kills = 6984, t5_kills = 0, deads = 58633,
  governor_id = 210315145
WHERE name IN ('unlimit', 'ᵃⁿᵍunlimit') AND (kills IS NULL OR kills = 0);

-- Dela Steven: 11.5M power, 2.3M KP
UPDATE alliance_roster SET
  kills = 2276590, t4_kills = 211687, t5_kills = 7986, deads = 0,
  governor_id = 209606370
WHERE name = 'Dela Steven' AND (kills IS NULL OR kills = 0);

-- Bryan: 10.1M power, 2.2M KP
UPDATE alliance_roster SET
  kills = 2177890, t4_kills = 93616, t5_kills = 12855, deads = 0,
  governor_id = 210389379
WHERE name IN ('Bryan', 'ᵃⁿᵍBryan') AND (kills IS NULL OR kills = 0);

-- MoNkE: 11M power, 1.5M KP
UPDATE alliance_roster SET
  kills = 1521738, t4_kills = 877, t5_kills = 0, deads = 170318,
  governor_id = 210412502
WHERE name IN ('MoNkE', 'ᵃⁿᵍMoNkE') AND (kills IS NULL OR kills = 0);

-- Tombuk: 9.6M power, 463K KP
UPDATE alliance_roster SET
  kills = 462807, t4_kills = 21236, t5_kills = 0, deads = 80726,
  governor_id = 210404609
WHERE name IN ('Tombuk', 'ᵃⁿᵍTombuk') AND (kills IS NULL OR kills = 0);

-- Sway2x: 5.7M power, 609K KP
UPDATE alliance_roster SET
  kills = 608588, t4_kills = 0, t5_kills = 0, deads = 74864,
  governor_id = 210419804
WHERE name IN ('Sway2x', 'ᵃⁿᵍSway2x') AND (kills IS NULL OR kills = 0);

-- =============================================
-- OTHER PREFIXES
-- =============================================

-- CHEZEE: 13.7M power, 3.02M KP (ᴿᵁ prefix)
UPDATE alliance_roster SET
  kills = 3017871, t4_kills = 297880, t5_kills = 0, deads = 20151,
  governor_id = 209816068
WHERE name IN ('CHEZEE', 'ᴿᵁCHEZEE') AND (kills IS NULL OR kills = 0);

-- SkyLord: 12.2M power, 1.94M KP (ᴿᵁ prefix)
UPDATE alliance_roster SET
  kills = 1939126, t4_kills = 157889, t5_kills = 4422, deads = 0,
  governor_id = 209636800
WHERE name IN ('SkyLord', 'ᴿᵁSkyLord') AND (kills IS NULL OR kills = 0);

-- Escipion: 11.4M power, 1.65M KP (кк prefix)
UPDATE alliance_roster SET
  kills = 1647660, t4_kills = 105330, t5_kills = 5021, deads = 0,
  governor_id = 209800733
WHERE name IN ('Escipion', 'кк Escipion') AND (kills IS NULL OR kills = 0);

-- Zdrawe: 11.7M power, 368K KP (as Zdrawee)
UPDATE alliance_roster SET
  kills = 367733, t4_kills = 36728, t5_kills = 0, deads = 0,
  governor_id = 210374268
WHERE name IN ('Zdrawe', 'Zdrawee') AND (kills IS NULL OR kills = 0);

-- Mixuee: 14.1M power, 0 KP (ᴳᴸ prefix)
UPDATE alliance_roster SET
  governor_id = 209674062
WHERE name IN ('Mixuee', 'ᴳᴸ Mixuee');

-- lady (as Lady Leanna): 11.4M power, 97K KP
UPDATE alliance_roster SET
  kills = 96810, t4_kills = 9681, t5_kills = 0, deads = 0,
  governor_id = 209912139
WHERE name IN ('lady', 'Lady Leanna') AND (kills IS NULL OR kills = 0);

-- BiNganHoa (as BỉNgạnHoa): 18.4M power, 2.2M KP
UPDATE alliance_roster SET
  kills = 2156469, t4_kills = 209467, t5_kills = 0, deads = 0,
  governor_id = 209805471
WHERE name IN ('BiNganHoa', 'BỉNgạnHoa') AND (kills IS NULL OR kills = 0);

-- モニタリング: 9.8M power, 1.8M KP
UPDATE alliance_roster SET
  kills = 1825364, t4_kills = 158341, t5_kills = 0, deads = 96426,
  governor_id = 210298691
WHERE name = 'モニタリング' AND (kills IS NULL OR kills = 0);

-- =============================================
-- VERIFY - Show members still missing KP
-- =============================================
SELECT name, power, kills, governor_id
FROM alliance_roster
WHERE is_active = true
  AND (kills IS NULL OR kills = 0)
ORDER BY power DESC;
