-- Migration: Split pass into pass_4/pass_5/pass_6, remove starting_zone, add circle_defense
-- Run against Supabase SQL editor

-- 1. Migrate existing 'pass' rows to 'pass_5' (default middle level)
UPDATE public.kvk_map_features
SET feature_type = 'pass_5', level = COALESCE(level, 5)
WHERE feature_type = 'pass';

-- 2. Delete any starting_zone markers (zones will be regions)
DELETE FROM public.kvk_map_features
WHERE feature_type = 'starting_zone';

-- 3. Drop old CHECK constraint and add updated one
ALTER TABLE public.kvk_map_features
  DROP CONSTRAINT IF EXISTS kvk_map_features_feature_type_check;

ALTER TABLE public.kvk_map_features
  ADD CONSTRAINT kvk_map_features_feature_type_check
  CHECK (feature_type IN (
    'pass_4', 'pass_5', 'pass_6',
    'crusader_fortress', 'crusader_camp',
    'hieron_steel', 'hieron_thorns',
    'ancient_ruins',
    'circle_nature', 'circle_vitality', 'circle_courage', 'circle_defense',
    'tempest_sanctuary',
    'altar_darkness',
    'ziggurat'
  ));
