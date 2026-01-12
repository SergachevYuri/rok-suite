-- Import new roster members from ang_roster_20250112.csv
-- Date: 2026-01-12
-- Only adds new members, does not remove existing ones

-- New members to add (not in existing roster)
INSERT INTO alliance_roster (name, power, role)
VALUES
  ('MadFluffy', 45542, 'R5'),
  ('vn kenji', 14052895, 'R1'),
  ('세계평화', 12619488, 'R1'),
  ('Rudues', 12434375, 'R1'),
  ('GHOST', 11125084, 'R1'),
  ('KapiBara', 9416431, 'R1')
ON CONFLICT (name) DO NOTHING;

-- Update roles for existing members who may have changed
UPDATE alliance_roster SET role = 'R3' WHERE name = 'NECO' AND role != 'R3';
UPDATE alliance_roster SET role = 'R3' WHERE name = 'Draken' AND role != 'R3';
UPDATE alliance_roster SET role = 'R3' WHERE name = 'Obi' AND role != 'R3';
UPDATE alliance_roster SET role = 'R3' WHERE name = 'Sonk8' AND role != 'R3';
UPDATE alliance_roster SET role = 'R3' WHERE name = 'Milos' AND role != 'R3';
UPDATE alliance_roster SET role = 'R3' WHERE name = 'TRAP' AND role != 'R3';
UPDATE alliance_roster SET role = 'R2' WHERE name = 'winkvk' AND role != 'R2';
UPDATE alliance_roster SET role = 'R2' WHERE name = 'hungvv' AND role != 'R2';
UPDATE alliance_roster SET role = 'R2' WHERE name = 'Bakr' AND role != 'R2';
UPDATE alliance_roster SET role = 'R2' WHERE name = 'sóc' AND role != 'R2';
UPDATE alliance_roster SET role = 'R2' WHERE name = 'ALONE' AND role != 'R2';

-- Update power values for all existing members (snapshot update)
UPDATE alliance_roster SET power = 75493512 WHERE name = 'Fluffy';
UPDATE alliance_roster SET power = 74637029 WHERE name = 'Sysstem';
UPDATE alliance_roster SET power = 65251113 WHERE name = 'Suntzu';
UPDATE alliance_roster SET power = 23571199 WHERE name = 'Funny';
UPDATE alliance_roster SET power = 20826857 WHERE name = 'Fluffy Queen';
UPDATE alliance_roster SET power = 20710260 WHERE name = 'BBQSGE';
UPDATE alliance_roster SET power = 20264518 WHERE name = 'Vael';
UPDATE alliance_roster SET power = 14217020 WHERE name = 'Cain';
UPDATE alliance_roster SET power = 18211788 WHERE name = 'NECO';
UPDATE alliance_roster SET power = 17737115 WHERE name = 'Draken';
UPDATE alliance_roster SET power = 17648674 WHERE name = 'Sadgame';
UPDATE alliance_roster SET power = 17385409 WHERE name = 'Obi';
UPDATE alliance_roster SET power = 17186926 WHERE name = 'Sonk8';
UPDATE alliance_roster SET power = 17178072 WHERE name = 'STALINGGARD';
UPDATE alliance_roster SET power = 16996099 WHERE name = 'Armstrong jr XL';
UPDATE alliance_roster SET power = 15026469 WHERE name = 'Soutz';
UPDATE alliance_roster SET power = 14790528 WHERE name = 'Alcar';
UPDATE alliance_roster SET power = 14561826 WHERE name = 'CHEZEE';
UPDATE alliance_roster SET power = 14389749 WHERE name = 'Queen of Chaos';
UPDATE alliance_roster SET power = 13782071 WHERE name = 'Nev✖';
UPDATE alliance_roster SET power = 13139832 WHERE name = 'TRAP';
UPDATE alliance_roster SET power = 13051515 WHERE name = 'Milos';
UPDATE alliance_roster SET power = 12139250 WHERE name = 'BryanV';
UPDATE alliance_roster SET power = 11668891 WHERE name = 'Nolie';
UPDATE alliance_roster SET power = 10177081 WHERE name = 'Jo';
UPDATE alliance_roster SET power = 9776607 WHERE name = 'Dante';
UPDATE alliance_roster SET power = 9675907 WHERE name = 'Alak D';
UPDATE alliance_roster SET power = 9269136 WHERE name = 'Sunman';
UPDATE alliance_roster SET power = 7437277 WHERE name = 'Shroud';
UPDATE alliance_roster SET power = 17459877 WHERE name = 'winkvk';
UPDATE alliance_roster SET power = 16699520 WHERE name = 'Furiaaa';
UPDATE alliance_roster SET power = 16182445 WHERE name = 'hungvv';
UPDATE alliance_roster SET power = 14806419 WHERE name = 'Mixuee';
UPDATE alliance_roster SET power = 13895940 WHERE name = 'bones';
UPDATE alliance_roster SET power = 13169393 WHERE name = 'ShadowLunar';
UPDATE alliance_roster SET power = 12904224 WHERE name = 'Bakr';
UPDATE alliance_roster SET power = 12893804 WHERE name = 'sóc';
UPDATE alliance_roster SET power = 12398059 WHERE name = 'Dark';
UPDATE alliance_roster SET power = 11584639 WHERE name = 'leander112';
UPDATE alliance_roster SET power = 9151480 WHERE name = 'SAMXINH';
UPDATE alliance_roster SET power = 8894238 WHERE name = 'Wallerun I';
UPDATE alliance_roster SET power = 8862081 WHERE name = 'ALONE';
UPDATE alliance_roster SET power = 30103982 WHERE name = 'BbyVix';
UPDATE alliance_roster SET power = 25106299 WHERE name = 'Bun';
UPDATE alliance_roster SET power = 22155937 WHERE name = 'cloud';
UPDATE alliance_roster SET power = 21196533 WHERE name = 'Raijin';
UPDATE alliance_roster SET power = 20912310 WHERE name = 'Dooffy';
UPDATE alliance_roster SET power = 20450029 WHERE name = 'Calca';
UPDATE alliance_roster SET power = 20293965 WHERE name = 'GiaHuy';
UPDATE alliance_roster SET power = 19828939 WHERE name = 'BiNganHoa';
UPDATE alliance_roster SET power = 18637334 WHERE name = 'bear';
UPDATE alliance_roster SET power = 17468896 WHERE name = 'FnDuke';
UPDATE alliance_roster SET power = 17296079 WHERE name = 'LOLI';
UPDATE alliance_roster SET power = 17004672 WHERE name = 'TURAN80g';
UPDATE alliance_roster SET power = 16870861 WHERE name = 'BáOo';
UPDATE alliance_roster SET power = 16630866 WHERE name = 'shorty';
UPDATE alliance_roster SET power = 16580234 WHERE name = 'unlimit';
UPDATE alliance_roster SET power = 16396360 WHERE name = 'Fluffy Jester';
UPDATE alliance_roster SET power = 16238359 WHERE name = 'FRODO';
UPDATE alliance_roster SET power = 15974309 WHERE name = 'Panh';
UPDATE alliance_roster SET power = 15811279 WHERE name = 'Gouverneur';
UPDATE alliance_roster SET power = 15628893 WHERE name = 'ClayFM';
UPDATE alliance_roster SET power = 15475032 WHERE name = 'Fluffy Lover';
UPDATE alliance_roster SET power = 14798819 WHERE name = 'KaiLey';
UPDATE alliance_roster SET power = 14770326 WHERE name = 'GLordMai';
UPDATE alliance_roster SET power = 14587926 WHERE name = 'ANH TUAN 1';
UPDATE alliance_roster SET power = 14543481 WHERE name = 'Gund';
UPDATE alliance_roster SET power = 14531409 WHERE name = 'Zdrawe';
UPDATE alliance_roster SET power = 14454405 WHERE name = 'orzrzi';
UPDATE alliance_roster SET power = 14447979 WHERE name = 'Zaebali';
UPDATE alliance_roster SET power = 14398520 WHERE name = 'KomVD2';
UPDATE alliance_roster SET power = 14000961 WHERE name = 'Lukes';
UPDATE alliance_roster SET power = 13754606 WHERE name = 'lady';
UPDATE alliance_roster SET power = 13734175 WHERE name = 'Hoangg';
UPDATE alliance_roster SET power = 13702821 WHERE name = 'SsOren';
UPDATE alliance_roster SET power = 13552629 WHERE name = 'Notor';
UPDATE alliance_roster SET power = 13436270 WHERE name = 'TGL';
UPDATE alliance_roster SET power = 13294230 WHERE name = 'Dela Steven';
UPDATE alliance_roster SET power = 13289673 WHERE name = 'Bụng báo';
UPDATE alliance_roster SET power = 13113881 WHERE name = 'Bryan';
UPDATE alliance_roster SET power = 13061962 WHERE name = 'lml Keter lml';
UPDATE alliance_roster SET power = 12864789 WHERE name = 'Đảo 93';
UPDATE alliance_roster SET power = 12769997 WHERE name = 'Escipion';
UPDATE alliance_roster SET power = 12623413 WHERE name = 'Stultitia';
UPDATE alliance_roster SET power = 12549222 WHERE name = 'sungod';
UPDATE alliance_roster SET power = 12532847 WHERE name = 'GiuliaFC';
UPDATE alliance_roster SET power = 12396998 WHERE name = 'gladiador 28';
UPDATE alliance_roster SET power = 12379223 WHERE name = 'sir Yuckfou';
UPDATE alliance_roster SET power = 12371786 WHERE name = 'Xtelli';
UPDATE alliance_roster SET power = 12326034 WHERE name = 'bySel';
UPDATE alliance_roster SET power = 12291951 WHERE name = 'XMihawkX';
UPDATE alliance_roster SET power = 12032596 WHERE name = 'CBC';
UPDATE alliance_roster SET power = 11947820 WHERE name = 'Nhi';
UPDATE alliance_roster SET power = 11633692 WHERE name = 'EF SàuVôLệ';
UPDATE alliance_roster SET power = 11519437 WHERE name = 'モニタリング';
UPDATE alliance_roster SET power = 11068822 WHERE name = 'suet';
UPDATE alliance_roster SET power = 10874117 WHERE name = 'Ронка';
UPDATE alliance_roster SET power = 10660784 WHERE name = 'Cowl';
UPDATE alliance_roster SET power = 10505883 WHERE name = 'CAPITAN';
UPDATE alliance_roster SET power = 10186221 WHERE name = 'Akka';
UPDATE alliance_roster SET power = 10169566 WHERE name = 'yigitl';
UPDATE alliance_roster SET power = 9989462 WHERE name = 'reeeldid';
UPDATE alliance_roster SET power = 9971731 WHERE name = 'Batussai';
UPDATE alliance_roster SET power = 9844125 WHERE name = 'ADOLF SAMI';
UPDATE alliance_roster SET power = 9715445 WHERE name = 'ksa 511';
UPDATE alliance_roster SET power = 9060115 WHERE name = 'AcDeputatovaDi';
UPDATE alliance_roster SET power = 9007787 WHERE name = 'KouSmiNaS';
UPDATE alliance_roster SET power = 7966926 WHERE name = 'AV✖Sirelli';
UPDATE alliance_roster SET power = 7915801 WHERE name = 'STEPHENлж';
UPDATE alliance_roster SET power = 7594411 WHERE name = 'Kether1';
UPDATE alliance_roster SET power = 7514568 WHERE name = 'thegoathimself';
UPDATE alliance_roster SET power = 7396087 WHERE name = 'HoangRed';
UPDATE alliance_roster SET power = 13271650 WHERE name = 'casper';
UPDATE alliance_roster SET power = 8438318 WHERE name = 'God chosen one';
UPDATE alliance_roster SET power = 12208122 WHERE name = 'bySel';
UPDATE alliance_roster SET power = 9904575 WHERE name = 'Aminvn22';
UPDATE alliance_roster SET power = 14730567 WHERE name = 'SkyLord';

-- Verification queries (run separately):
-- SELECT name, power, rank FROM alliance_roster ORDER BY power DESC LIMIT 20;
-- SELECT COUNT(*) FROM alliance_roster;
