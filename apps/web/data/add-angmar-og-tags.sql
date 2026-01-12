-- Add tags column to alliance_roster table
-- Run this first if the column doesn't exist:
-- ALTER TABLE alliance_roster ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Tag Angmar OG (core) members
-- Source: angmar-og.csv

UPDATE alliance_roster SET tags = array_append(COALESCE(tags, '{}'), 'angmar-og')
WHERE name IN (
  -- R4 Officers (all are core)
  'Suntzu',
  'Funny',
  'BBQSGE',
  'Fluffy Queen',
  'Vael',
  'Cain',
  'Sysstem',
  'Fluffy',
  -- Core members (from CSV columns 1-4)
  'thegoathimself',
  'unlimit',
  'Nev✖',
  'Wallerun I',
  'Bun',
  'FRODO',
  'BryanV',
  'ksa 511',
  'Raijin',
  'Gouverneur',
  'Nolie',
  'ALONE',
  'Calca',
  'Fluffy Lover',
  'Jo',
  'GLordMai',
  'BiNganHoa',
  'ANH TUAN 1',
  'Dante',
  'AV✖Sirelli',
  'FnDuke',
  'Zdrawe',
  'Alak D',
  'STEPHENлж',
  'Fluffy Jester',
  'Shroud',
  'Lukes',
  'ClayFM',
  'lady',
  'leander112',
  'TGL',
  'SkyLord',
  'lml Keter lml',
  'Đảo 93',
  'GiuliaFC',
  'KaiLey',
  'Xtelli',
  'Hoangg',
  'Zaebali',
  'CBC',
  'Obi',
  'suet',
  'Notor',
  'reeeldid',
  'sir Yuckfou',
  'Akka',
  'Bryan',
  'ADOLF SAMI',
  'Sonk8',
  'Batussai',
  'sungod',
  'winkvk',
  'Armstrong jr XL',
  'hungvv',
  'Milos',
  'Nhi',
  'BbyVix',
  'SsOren',
  'CAPITAN',
  'sóc',
  'yigitl',
  'Bakr',
  'XMihawkX',
  'cloud',
  'NECO',
  'orzrzi',
  'Dooffy',
  'Sadgame',
  'TURAN80g',
  'GiaHuy',
  'Draken',
  'Ронка',
  'bear',
  'Alcar',
  'Cowl',
  'TRAP',
  'Queen of Chaos',
  'STALINGGARD',
  'KomVD2',
  'EF SàuVôLệ',
  'Furiaaa',
  'LOLI',
  -- People in question (might be core)
  'Gund',
  'ShadowLunar',
  'モニタリング',
  -- Inactive/quit core members (added to roster for tracking)
  'DonV4',
  'MayorEric',
  'Divid3',
  'WOLF',
  'Ceje',
  'SSRB',
  'ZETMA',
  'Black Ruler'
)
AND NOT ('angmar-og' = ANY(COALESCE(tags, '{}')));

-- Tag inactive members (stepped away, on break, or known inactive)
UPDATE alliance_roster SET tags = array_append(COALESCE(tags, '{}'), 'inactive')
WHERE name IN (
  'Sysstem',
  'Soutz',
  'DonV4',
  'MayorEric',
  'Divid3',
  'WOLF',
  'Ceje',
  'SSRB'
)
AND NOT ('inactive' = ANY(COALESCE(tags, '{}')));

-- Tag quit members (left the alliance)
UPDATE alliance_roster SET tags = array_append(COALESCE(tags, '{}'), 'quit')
WHERE name IN (
  'ZETMA',
  'Black Ruler'
)
AND NOT ('quit' = ANY(COALESCE(tags, '{}')));

-- Verification: Check tagged members
-- SELECT name, tags FROM alliance_roster WHERE 'angmar-og' = ANY(tags) ORDER BY name;
-- SELECT name, tags FROM alliance_roster WHERE 'inactive' = ANY(tags) ORDER BY name;

-- Count: How many were tagged
-- SELECT COUNT(*) as angmar_og_count FROM alliance_roster WHERE 'angmar-og' = ANY(tags);
-- SELECT COUNT(*) as inactive_count FROM alliance_roster WHERE 'inactive' = ANY(tags);
