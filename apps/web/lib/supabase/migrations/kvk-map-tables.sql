-- Migration: KvK Map War Room tables
-- Three-tier KvK map planning tool (admin, officer planner, viewer)

-- =============================================================================
-- 1. KVK_MAPS - Base map definitions (one per KvK type/season)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_maps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  kvk_type text NOT NULL DEFAULT 's2-distant-journey',
  season text,
  image_path text NOT NULL DEFAULT '/maps/S2DistantJourney.jpg',
  image_width integer NOT NULL DEFAULT 2000,
  image_height integer NOT NULL DEFAULT 2000,
  symmetry_segments integer DEFAULT 8,
  symmetry_center_x float DEFAULT 1000,
  symmetry_center_y float DEFAULT 1000,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'base_complete', 'planning', 'active')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kvk_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_maps"
  ON public.kvk_maps FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_maps"
  ON public.kvk_maps FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_maps"
  ON public.kvk_maps FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_maps"
  ON public.kvk_maps FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_maps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_maps TO authenticated;

-- =============================================================================
-- 2. KVK_MAP_FEATURES - Structural features placed by admin
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_map_features (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  feature_type text NOT NULL CHECK (feature_type IN ('pass', 'crusader_fortress', 'crusader_camp', 'hieron_steel', 'hieron_thorns', 'ancient_ruins', 'circle_nature', 'circle_vitality', 'circle_courage', 'tempest_sanctuary', 'altar_darkness', 'ziggurat', 'starting_zone')),
  name text,
  x float NOT NULL,
  y float NOT NULL,
  level integer,
  zone integer,
  buff_name text,
  buff_value text,
  buff_description text,
  metadata jsonb DEFAULT '{}',
  is_template boolean DEFAULT false,
  template_segment integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_features_map ON public.kvk_map_features(map_id);
CREATE INDEX IF NOT EXISTS idx_kvk_features_type ON public.kvk_map_features(map_id, feature_type);

ALTER TABLE public.kvk_map_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_map_features"
  ON public.kvk_map_features FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_map_features"
  ON public.kvk_map_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_map_features"
  ON public.kvk_map_features FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_map_features"
  ON public.kvk_map_features FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_features TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_features TO authenticated;

-- =============================================================================
-- 3. KVK_MAP_ZONES - Zone polygon definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_map_zones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  zone_number integer NOT NULL,
  name text,
  zone_type text DEFAULT 'zone' CHECK (zone_type IN ('zone', 'starting_zone')),
  polygon jsonb NOT NULL,
  color text DEFAULT '#3388ff',
  opacity float DEFAULT 0.2,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_zones_map ON public.kvk_map_zones(map_id);

ALTER TABLE public.kvk_map_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_map_zones"
  ON public.kvk_map_zones FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_map_zones"
  ON public.kvk_map_zones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_map_zones"
  ON public.kvk_map_zones FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_map_zones"
  ON public.kvk_map_zones FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_map_zones TO authenticated;

-- =============================================================================
-- 4. KVK_ALLIANCES - Alliance roster for this KvK season
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_alliances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  tag text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'support' CHECK (role IN ('top', 'support')),
  color text NOT NULL DEFAULT '#ef4444',
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_alliances_map ON public.kvk_alliances(map_id);

ALTER TABLE public.kvk_alliances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_alliances"
  ON public.kvk_alliances FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_alliances"
  ON public.kvk_alliances FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_alliances"
  ON public.kvk_alliances FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_alliances"
  ON public.kvk_alliances FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_alliances TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_alliances TO authenticated;

-- =============================================================================
-- 5. KVK_ASSIGNMENTS - Officer assignments of alliances to features
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.kvk_map_features(id) ON DELETE CASCADE,
  alliance_id uuid REFERENCES public.kvk_alliances(id) ON DELETE SET NULL,
  status text DEFAULT 'planned' CHECK (status IN ('planned', 'contested', 'occupied', 'lost')),
  priority integer DEFAULT 0,
  notes text,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_assignments_map ON public.kvk_assignments(map_id);
CREATE INDEX IF NOT EXISTS idx_kvk_assignments_alliance ON public.kvk_assignments(alliance_id);

ALTER TABLE public.kvk_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_assignments"
  ON public.kvk_assignments FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_assignments"
  ON public.kvk_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_assignments"
  ON public.kvk_assignments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_assignments"
  ON public.kvk_assignments FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_assignments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_assignments TO authenticated;

-- =============================================================================
-- 6. KVK_ACHIEVEMENTS - Achievement definitions added by admin
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_achievements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  scope text NOT NULL CHECK (scope IN ('individual', 'alliance', 'kingdom')),
  category text,
  requirement_type text NOT NULL CHECK (requirement_type IN ('occupy_count', 'occupy_specific', 'custom')),
  requirement_feature_type text,
  requirement_count integer,
  requirement_details jsonb DEFAULT '{}',
  reward_tier integer DEFAULT 1,
  reward_gems integer DEFAULT 0,
  reward_speedups_minutes integer DEFAULT 0,
  reward_gold_heads integer DEFAULT 0,
  reward_other text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kvk_achievements_map ON public.kvk_achievements(map_id);

ALTER TABLE public.kvk_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_achievements"
  ON public.kvk_achievements FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_achievements"
  ON public.kvk_achievements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_achievements"
  ON public.kvk_achievements FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_achievements"
  ON public.kvk_achievements FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_achievements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_achievements TO authenticated;

-- =============================================================================
-- 7. KVK_ACHIEVEMENT_PROGRESS - Tracks progress toward achievements
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_achievement_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.kvk_achievements(id) ON DELETE CASCADE,
  alliance_id uuid REFERENCES public.kvk_alliances(id) ON DELETE SET NULL,
  current_count integer DEFAULT 0,
  is_completed boolean DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(achievement_id, alliance_id)
);

CREATE INDEX IF NOT EXISTS idx_kvk_achievement_progress_map ON public.kvk_achievement_progress(map_id);

ALTER TABLE public.kvk_achievement_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_achievement_progress"
  ON public.kvk_achievement_progress FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_achievement_progress"
  ON public.kvk_achievement_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_achievement_progress"
  ON public.kvk_achievement_progress FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_achievement_progress"
  ON public.kvk_achievement_progress FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_achievement_progress TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_achievement_progress TO authenticated;

-- =============================================================================
-- SEED: Default active map
-- =============================================================================

INSERT INTO public.kvk_maps (name, kvk_type, image_path, image_width, image_height, status)
VALUES ('S2 Distant Journey', 's2-distant-journey', '/maps/S2DistantJourney.jpg', 2000, 2000, 'draft')
ON CONFLICT DO NOTHING;
