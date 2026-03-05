-- Migration: Add 'flag' and 'fortress' to feature_type CHECK constraint
-- Run against Supabase SQL editor

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
    'ziggurat',
    'flag', 'fortress'
  ));
