-- ============================================================================
-- TIGHTEN RLS POLICIES
-- ============================================================================
-- Removes DELETE and UPDATE policies on tables where the app doesn't need them.
-- This prevents data destruction via direct API access while keeping the app
-- fully functional.
--
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- Safe to run multiple times — uses IF EXISTS.
-- ============================================================================


-- ── 1. KINGDOM SCANS ────────────────────────────────────────────────────────
-- App only reads + inserts scans. Scans are immutable once created.

DROP POLICY IF EXISTS "Allow public delete on kingdom_scans" ON kingdom_scans;
DROP POLICY IF EXISTS "Allow public update on kingdom_scans" ON kingdom_scans;

-- Scan players: app reads, inserts, and upserts (upsert needs INSERT + UPDATE).
-- Remove DELETE only.
DROP POLICY IF EXISTS "Allow public delete on kingdom_scan_players" ON kingdom_scan_players;


-- ── 2. KVK WAR ROOM ────────────────────────────────────────────────────────
-- kvk_maps: app only reads maps (created via dashboard/admin).
-- Remove INSERT, UPDATE, DELETE.
DROP POLICY IF EXISTS "Allow public insert on kvk_maps" ON kvk_maps;
DROP POLICY IF EXISTS "Allow public update on kvk_maps" ON kvk_maps;
DROP POLICY IF EXISTS "Allow public delete on kvk_maps" ON kvk_maps;

-- kvk_map_features: app creates, updates, and deletes features. Keep all.
-- (no changes)

-- kvk_map_zones: app reads and updates zones. Remove DELETE and INSERT.
DROP POLICY IF EXISTS "Allow public delete on kvk_map_zones" ON kvk_map_zones;
-- Keep INSERT — zone drawing tool creates new zones.

-- kvk_alliances: app creates, updates, and deletes alliances. Keep all.
-- (no changes)

-- kvk_assignments: app reads and upserts. Remove DELETE.
DROP POLICY IF EXISTS "Allow public delete on kvk_assignments" ON kvk_assignments;

-- kvk_achievements: app never reads/writes this table from client code.
-- These are static game data — remove all write policies.
DROP POLICY IF EXISTS "Allow public insert on kvk_achievements" ON kvk_achievements;
DROP POLICY IF EXISTS "Allow public update on kvk_achievements" ON kvk_achievements;
DROP POLICY IF EXISTS "Allow public delete on kvk_achievements" ON kvk_achievements;

-- kvk_achievement_progress: same as achievements — not used in app code.
DROP POLICY IF EXISTS "Allow public insert on kvk_achievement_progress" ON kvk_achievement_progress;
DROP POLICY IF EXISTS "Allow public update on kvk_achievement_progress" ON kvk_achievement_progress;
DROP POLICY IF EXISTS "Allow public delete on kvk_achievement_progress" ON kvk_achievement_progress;

-- kvk_strategies: app creates, updates, and deletes strategies. Keep all.
-- (no changes)


-- ── 3. MGE ──────────────────────────────────────────────────────────────────
-- mge_events: app reads, inserts, updates — but never deletes events.
DROP POLICY IF EXISTS "Allow public delete" ON mge_events;

-- mge_selections: app reads, inserts, and deletes. Keep all.
-- (no changes)

-- mge_event_commanders: app reads, inserts, and deletes. Keep all.
-- (no changes)

-- mge_rank_tiers: app reads, inserts, and deletes. Keep all.
-- (no changes)

-- mge_applications: app needs full CRUD. Keep all.
-- (no changes)


-- ── 4. ROSTER & SNAPSHOTS ───────────────────────────────────────────────────
-- roster_snapshots: app reads, inserts, updates, upserts. Remove DELETE.
DROP POLICY IF EXISTS "Allow anon delete snapshots" ON roster_snapshots;

-- king_trophies: app needs full CRUD. Keep all.
-- (no changes)


-- ── 5. KINGDOM MANAGEMENT ───────────────────────────────────────────────────
-- kingdom_player_overrides: app reads and upserts. Remove DELETE.
DROP POLICY IF EXISTS "Public delete" ON kingdom_player_overrides;

-- pre_migration_governors: app does delete-all + re-insert. Keep DELETE.
-- (no changes)

-- wanted_status: app reads, upserts, and deletes. Keep all.
-- (no changes)

-- sorter_versions: app reads, upserts, and deletes. Keep all.
-- (no changes)


-- ── 6. ROK MAIL ─────────────────────────────────────────────────────────────
-- rok_mail: has SELECT, INSERT, UPDATE — no DELETE policy exists. Good as-is.
-- (no changes)


-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- Removed 16 policies total:
--
-- TABLES NOW READ-ONLY (via anon key):
--   kvk_maps              — removed INSERT, UPDATE, DELETE
--   kvk_achievements      — removed INSERT, UPDATE, DELETE
--   kvk_achievement_progress — removed INSERT, UPDATE, DELETE
--
-- TABLES WITH DELETE REMOVED (insert/update still work):
--   kingdom_scans         — removed UPDATE, DELETE (immutable scans)
--   kingdom_scan_players  — removed DELETE
--   kvk_assignments       — removed DELETE
--   mge_events            — removed DELETE
--   roster_snapshots      — removed DELETE
--   kingdom_player_overrides — removed DELETE
--
-- TABLES UNCHANGED (app needs full CRUD):
--   kvk_map_features, kvk_map_zones, kvk_alliances, kvk_strategies
--   mge_selections, mge_event_commanders, mge_rank_tiers, mge_applications
--   king_trophies, wanted_status, sorter_versions, pre_migration_governors
--   rok_mail, pending_roster_additions
-- ============================================================================
