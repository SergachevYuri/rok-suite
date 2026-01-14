-- Restore remaining 30 members who lost KP data
-- Based on Jan 12 snapshot values

-- Fluffy Queen: 18.5M KP (currently 3.06M)
UPDATE alliance_roster SET kills = 18500000 WHERE name = 'Fluffy Queen' AND kills < 18500000;

-- SkyLord: 13.1M KP (currently 1.94M)
UPDATE alliance_roster SET kills = 13100000 WHERE name IN ('SkyLord', 'ᴿᵁSkyLord', 'ʳᵘSkyLord') AND kills < 13100000;

-- Sysstem: 12.19M KP (currently 2.29M)
UPDATE alliance_roster SET kills = 12185000 WHERE name = 'Sysstem' AND kills < 12185000;

-- Zaebali: 11.76M KP (currently 3.49M)
UPDATE alliance_roster SET kills = 11762000 WHERE name = 'Zaebali' AND kills < 11762000;

-- ShadowLunar: 11M KP (currently 1.35M)
UPDATE alliance_roster SET kills = 11000000 WHERE name IN ('ShadowLunar', '屮ShadowLunar') AND kills < 11000000;

-- Fluffy Jester: 10.98M KP (currently 1.79M)
UPDATE alliance_roster SET kills = 10980000 WHERE name = 'Fluffy Jester' AND kills < 10980000;

-- Fluffy Lover: 10.03M KP (currently 2.41M)
UPDATE alliance_roster SET kills = 10031000 WHERE name = 'Fluffy Lover' AND kills < 10031000;

-- Dela Steven: 9.99M KP (currently 2.28M)
UPDATE alliance_roster SET kills = 9989000 WHERE name = 'Dela Steven' AND kills < 9989000;

-- Escipion: 9.1M KP (currently 1.65M)
UPDATE alliance_roster SET kills = 9095000 WHERE name IN ('Escipion', 'кк Escipion') AND kills < 9095000;

-- CHEZEE: 8.9M KP (currently 3.02M)
UPDATE alliance_roster SET kills = 8897000 WHERE name IN ('CHEZEE', 'ᴿᵁCHEZEE') AND kills < 8897000;

-- Đảo 93: 7.06M KP (currently 5.44M)
UPDATE alliance_roster SET kills = 7064000 WHERE name = 'Đảo 93' AND kills < 7064000;

-- CAPITAN: 6.49M KP (currently 150K)
UPDATE alliance_roster SET kills = 6491000 WHERE name IN ('CAPITAN', 'ˢᵗCAPITAN') AND kills < 6491000;

-- Furiaaa: 6.39M KP (currently 11K)
UPDATE alliance_roster SET kills = 6391000 WHERE name IN ('Furiaaa', 'ᴵᴸFuriaaa') AND kills < 6391000;

-- Obi: 5.8M KP (currently 3.33M)
UPDATE alliance_roster SET kills = 5800000 WHERE name IN ('Obi', 'ᵃⁿᵍObi') AND kills < 5800000;

-- Queen of Chaos: 5.75M KP (currently 754K)
UPDATE alliance_roster SET kills = 5750000 WHERE name = 'Queen of Chaos' AND kills < 5750000;

-- Batussai: 5.4M KP (currently 1.48M)
UPDATE alliance_roster SET kills = 5400000 WHERE name = 'Batussai' AND kills < 5400000;

-- FRODO: 5.17M KP (currently 1.26M)
UPDATE alliance_roster SET kills = 5170000 WHERE name IN ('FRODO', 'ᵃⁿᵍ FRODO', 'ᵃⁿᵍFRODO') AND kills < 5170000;

-- unlimit: 4.92M KP (currently 758K)
UPDATE alliance_roster SET kills = 4923000 WHERE name = 'unlimit' AND kills < 4923000;

-- モニタリング: 3.65M KP (currently 1.83M)
UPDATE alliance_roster SET kills = 3654000 WHERE name = 'モニタリング' AND kills < 3654000;

-- bySel: 3.24M KP (currently 466K)
UPDATE alliance_roster SET kills = 3237000 WHERE name = 'bySel' AND kills < 3237000;

-- Zdrawe: 3.2M KP (currently 368K)
UPDATE alliance_roster SET kills = 3200000 WHERE name IN ('Zdrawe', 'Zdrawee') AND kills < 3200000;

-- TURAN80g: 3.1M KP (currently 431K)
UPDATE alliance_roster SET kills = 3104000 WHERE name = 'TURAN80g' AND kills < 3104000;

-- GLordMai: 2.97M KP (currently 309K)
UPDATE alliance_roster SET kills = 2974000 WHERE name = 'GLordMai' AND kills < 2974000;

-- thegoathimself: 2.48M KP (currently 34K)
UPDATE alliance_roster SET kills = 2477000 WHERE name = 'thegoathimself' AND kills < 2477000;

-- Aminvn22: 2.3M KP (currently 298K)
UPDATE alliance_roster SET kills = 2295363 WHERE name = 'Aminvn22' AND kills < 2295363;

-- bones: 1.75M KP (currently 197K)
UPDATE alliance_roster SET kills = 1747000 WHERE name IN ('bones', 'ᶦˢbones') AND kills < 1747000;

-- lady: 1.56M KP (currently 97K)
UPDATE alliance_roster SET kills = 1557000 WHERE name IN ('lady', 'Lady Leanna') AND kills < 1557000;

-- God chosen one: 1.5M KP (currently 17K)
UPDATE alliance_roster SET kills = 1500000 WHERE name = 'God chosen one' AND kills < 1500000;

-- Armstrong jr XL: 1.36M KP (currently 121K)
UPDATE alliance_roster SET kills = 1363000 WHERE name = 'Armstrong jr XL' AND kills < 1363000;

-- ADOLF SAMI: 877K KP (currently 92K)
UPDATE alliance_roster SET kills = 877000 WHERE name = 'ADOLF SAMI' AND kills < 877000;

-- SAMXINH: 667K KP (currently 45K)
UPDATE alliance_roster SET kills = 667000 WHERE name = 'SAMXINH' AND kills < 667000;

-- 세계평화: 587K KP (currently 134K)
UPDATE alliance_roster SET kills = 587000 WHERE name = '세계평화' AND kills < 587000;

-- Gund: 436K KP (currently 10K)
UPDATE alliance_roster SET kills = 436000 WHERE name = 'Gund' AND kills < 436000;

-- =============================================
-- VERIFY ALL RESTORED
-- =============================================
SELECT name, kills as restored_kp
FROM alliance_roster
WHERE name IN (
  'Fluffy Queen', 'SkyLord', 'Sysstem', 'Zaebali', 'ShadowLunar',
  'Fluffy Jester', 'Fluffy Lover', 'Dela Steven', 'Escipion', 'CHEZEE',
  'Đảo 93', 'CAPITAN', 'Furiaaa', 'Obi', 'Queen of Chaos',
  'Batussai', 'FRODO', 'unlimit', 'モニタリング', 'bySel',
  'Zdrawe', 'TURAN80g', 'GLordMai', 'thegoathimself', 'Aminvn22',
  'bones', 'lady', 'God chosen one', 'Armstrong jr XL', 'ADOLF SAMI',
  'SAMXINH', '세계평화', 'Gund'
)
ORDER BY kills DESC;
