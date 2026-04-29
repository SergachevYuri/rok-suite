-- Fix RLS for seeds_kd_stats / seeds_kd_players.
-- The original schema-seeds.sql restricted writes to `authenticated`, but the
-- web app uses the `anon` key (gating is client-side via password), so upserts
-- were blocked. This relaxes policies to match the pattern used by other
-- tables in this project (mge, rok-mail, king_trophies, ...).
--
-- Run this once in your Supabase SQL Editor.

DROP POLICY IF EXISTS "seeds_kd_stats_read"    ON seeds_kd_stats;
DROP POLICY IF EXISTS "seeds_kd_stats_write"   ON seeds_kd_stats;
DROP POLICY IF EXISTS "seeds_kd_players_read"  ON seeds_kd_players;
DROP POLICY IF EXISTS "seeds_kd_players_write" ON seeds_kd_players;

DROP POLICY IF EXISTS "Allow public read"   ON seeds_kd_stats;
DROP POLICY IF EXISTS "Allow public insert" ON seeds_kd_stats;
DROP POLICY IF EXISTS "Allow public update" ON seeds_kd_stats;
DROP POLICY IF EXISTS "Allow public delete" ON seeds_kd_stats;
CREATE POLICY "Allow public read"   ON seeds_kd_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON seeds_kd_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON seeds_kd_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON seeds_kd_stats FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read"   ON seeds_kd_players;
DROP POLICY IF EXISTS "Allow public insert" ON seeds_kd_players;
DROP POLICY IF EXISTS "Allow public update" ON seeds_kd_players;
DROP POLICY IF EXISTS "Allow public delete" ON seeds_kd_players;
CREATE POLICY "Allow public read"   ON seeds_kd_players FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON seeds_kd_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON seeds_kd_players FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON seeds_kd_players FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON seeds_kd_stats   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON seeds_kd_players TO anon, authenticated;
