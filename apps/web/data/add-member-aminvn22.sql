-- Add Aminvn22 to alliance roster
INSERT INTO alliance_roster (name, power, kills, t4_kills, t5_kills, honor_points, role, is_active)
VALUES ('Aminvn22', 10412776, 2295363, 1422130, 371600, 10305, 'R1', true)
ON CONFLICT (name)
DO UPDATE SET 
  power = EXCLUDED.power,
  kills = EXCLUDED.kills,
  t4_kills = EXCLUDED.t4_kills,
  t5_kills = EXCLUDED.t5_kills,
  honor_points = EXCLUDED.honor_points,
  is_active = EXCLUDED.is_active;

-- Add to today's snapshot
INSERT INTO roster_snapshots (snapshot_date, member_name, power, kills, honor_points, role, is_active)
VALUES ('2026-01-12', 'Aminvn22', 10412776, 2295363, 10305, 'R1', true)
ON CONFLICT (snapshot_date, member_name)
DO UPDATE SET power = EXCLUDED.power, kills = EXCLUDED.kills, honor_points = EXCLUDED.honor_points, role = EXCLUDED.role, is_active = EXCLUDED.is_active;
