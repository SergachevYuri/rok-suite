-- ============================================================================
-- KVK WAR PLANNING TABLES: zone notes, map arrows, zone actions
-- ============================================================================
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- ============================================================================

-- ─── Zone Battle Notes ─────────────────────────────────────────────────
-- One note per zone per stage. Supports upsert on (zone_id, stage).

CREATE TABLE IF NOT EXISTS public.kvk_zone_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.kvk_map_zones(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1,
  content text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_kvk_zone_notes_map
  ON public.kvk_zone_notes(map_id);

ALTER TABLE public.kvk_zone_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_zone_notes"
  ON public.kvk_zone_notes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_zone_notes"
  ON public.kvk_zone_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_zone_notes"
  ON public.kvk_zone_notes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_zone_notes"
  ON public.kvk_zone_notes FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_zone_notes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_zone_notes TO authenticated;

-- ─── Map Arrows ────────────────────────────────────────────────────────
-- Directional arrows on the map for attack/defense/reinforce plans.

CREATE TABLE IF NOT EXISTS public.kvk_map_arrows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  alliance_id uuid REFERENCES public.kvk_alliances(id) ON DELETE SET NULL,
  stage integer NOT NULL DEFAULT 1,
  arrow_type text NOT NULL DEFAULT 'attack' CHECK (arrow_type IN ('attack', 'defend', 'reinforce', 'rally')),
  waypoints jsonb NOT NULL DEFAULT '[]',
  label text,
  color_override text,
  dash_style text NOT NULL DEFAULT 'solid' CHECK (dash_style IN ('solid', 'dashed')),
  weight integer NOT NULL DEFAULT 3,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_map_arrows_map
  ON public.kvk_map_arrows(map_id);

ALTER TABLE public.kvk_map_arrows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_map_arrows"
  ON public.kvk_map_arrows FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_map_arrows"
  ON public.kvk_map_arrows FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_map_arrows"
  ON public.kvk_map_arrows FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_map_arrows"
  ON public.kvk_map_arrows FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_arrows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_arrows TO authenticated;

-- ─── Zone Action Checklist ─────────────────────────────────────────────
-- Ordered action items per zone per stage, checkable during execution.

CREATE TABLE IF NOT EXISTS public.kvk_zone_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.kvk_map_zones(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  checked_by text,
  checked_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_zone_actions_map
  ON public.kvk_zone_actions(map_id);

CREATE INDEX IF NOT EXISTS idx_kvk_zone_actions_zone_stage
  ON public.kvk_zone_actions(zone_id, stage, sort_order);

ALTER TABLE public.kvk_zone_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_zone_actions"
  ON public.kvk_zone_actions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_zone_actions"
  ON public.kvk_zone_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_zone_actions"
  ON public.kvk_zone_actions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_zone_actions"
  ON public.kvk_zone_actions FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_zone_actions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_zone_actions TO authenticated;

-- ─── Freehand Drawings ──────────────────────────────────────────────
-- Freehand polylines drawn on the map for quick sketches and plans.

CREATE TABLE IF NOT EXISTS public.kvk_map_drawings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1,
  points jsonb NOT NULL DEFAULT '[]',
  color text NOT NULL DEFAULT '#ef4444',
  weight integer NOT NULL DEFAULT 3,
  opacity real NOT NULL DEFAULT 0.8,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_map_drawings_map
  ON public.kvk_map_drawings(map_id);

ALTER TABLE public.kvk_map_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_map_drawings"
  ON public.kvk_map_drawings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_map_drawings"
  ON public.kvk_map_drawings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_map_drawings"
  ON public.kvk_map_drawings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_map_drawings"
  ON public.kvk_map_drawings FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_drawings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_drawings TO authenticated;

-- ─── Map Text Labels ────────────────────────────────────────────────
-- Text annotations placed on the map for callouts, notes, warnings.

CREATE TABLE IF NOT EXISTS public.kvk_map_labels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1,
  x real NOT NULL,
  y real NOT NULL,
  text text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#ffffff',
  font_size integer NOT NULL DEFAULT 14,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_map_labels_map
  ON public.kvk_map_labels(map_id);

ALTER TABLE public.kvk_map_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_map_labels"
  ON public.kvk_map_labels FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_map_labels"
  ON public.kvk_map_labels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_map_labels"
  ON public.kvk_map_labels FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_map_labels"
  ON public.kvk_map_labels FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_labels TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_labels TO authenticated;
