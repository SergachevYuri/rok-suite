-- Record AoO participation for Team 2 on 2026-01-12
-- Source: Confirmed participant list from user

-- Participants (12 members)
INSERT INTO event_participation (member_name, event_type, event_date, team, participated)
VALUES
  ('Armstrong jr XL', 'aoo', '2026-01-12', 'Team 2', true),
  ('Fluffy Lover', 'aoo', '2026-01-12', 'Team 2', true),
  ('SsOren', 'aoo', '2026-01-12', 'Team 2', true),
  ('Nolie', 'aoo', '2026-01-12', 'Team 2', true),
  ('Stultitia', 'aoo', '2026-01-12', 'Team 2', true),
  ('Panh', 'aoo', '2026-01-12', 'Team 2', true),
  ('Notor', 'aoo', '2026-01-12', 'Team 2', true),
  ('BryanV', 'aoo', '2026-01-12', 'Team 2', true),
  ('bones', 'aoo', '2026-01-12', 'Team 2', true),
  ('Draken', 'aoo', '2026-01-12', 'Team 2', true),
  ('ANH TUAN 1', 'aoo', '2026-01-12', 'Team 2', true),
  ('BáOo', 'aoo', '2026-01-12', 'Team 2', true)
ON CONFLICT (member_name, event_type, event_date)
DO UPDATE SET team = EXCLUDED.team, participated = EXCLUDED.participated;

-- Non-participants (assigned but did not participate)
INSERT INTO event_participation (member_name, event_type, event_date, team, participated)
VALUES
  ('Furiaaa', 'aoo', '2026-01-12', 'Team 2', false),
  ('FRODO', 'aoo', '2026-01-12', 'Team 2', false),
  ('Milos', 'aoo', '2026-01-12', 'Team 2', false),
  ('sóc', 'aoo', '2026-01-12', 'Team 2', false),
  ('Sunman', 'aoo', '2026-01-12', 'Team 2', false),
  ('Bakr', 'aoo', '2026-01-12', 'Team 2', false),
  ('Nhi', 'aoo', '2026-01-12', 'Team 2', false),
  ('Queen of Chaos', 'aoo', '2026-01-12', 'Team 2', false),
  ('Wallerun I', 'aoo', '2026-01-12', 'Team 2', false),
  ('ALONE', 'aoo', '2026-01-12', 'Team 2', false),
  ('Alcar', 'aoo', '2026-01-12', 'Team 2', false),
  ('SAMXINH', 'aoo', '2026-01-12', 'Team 2', false),
  ('Gund', 'aoo', '2026-01-12', 'Team 2', false),
  ('Akka', 'aoo', '2026-01-12', 'Team 2', false),
  ('Sonk8', 'aoo', '2026-01-12', 'Team 2', false),
  ('Dante', 'aoo', '2026-01-12', 'Team 2', false),
  ('ClayFM', 'aoo', '2026-01-12', 'Team 2', false),
  ('NECO', 'aoo', '2026-01-12', 'Team 2', false),
  ('STEPHENлж', 'aoo', '2026-01-12', 'Team 2', false),
  ('reeeldid', 'aoo', '2026-01-12', 'Team 2', false),
  ('hungvv', 'aoo', '2026-01-12', 'Team 2', false),
  ('Nev✖', 'aoo', '2026-01-12', 'Team 2', false),
  ('Alak D', 'aoo', '2026-01-12', 'Team 2', false),
  ('TGL', 'aoo', '2026-01-12', 'Team 2', false),
  ('lml Keter lml', 'aoo', '2026-01-12', 'Team 2', false),
  ('Cowl', 'aoo', '2026-01-12', 'Team 2', false)
ON CONFLICT (member_name, event_type, event_date)
DO UPDATE SET team = EXCLUDED.team, participated = EXCLUDED.participated;

-- Verification:
-- SELECT member_name, participated FROM event_participation
-- WHERE event_type = 'aoo' AND event_date = '2026-01-12' AND team = 'Team 2'
-- ORDER BY participated DESC, member_name;
