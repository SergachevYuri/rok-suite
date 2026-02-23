-- ============================================================================
-- SCALE COORDINATES FROM 2000 TO 1200
-- ============================================================================
-- RoK KvK maps use a 1200×1200 coordinate grid:
--   Top-left:     X=0,    Y=1200
--   Bottom-right:  X=1200, Y=0
--
-- Previously the map used a 2000×2000 pixel-based coordinate space.
-- This migration scales all stored coordinates by 1200/2000 = 0.6.
--
-- Run this in the Supabase SQL Editor. Safe to run only ONCE — running it
-- again would scale coordinates a second time.
-- ============================================================================


-- ── 1. Scale feature positions ────────────────────────────────────────────

UPDATE kvk_map_features
SET x = x * 0.6,
    y = y * 0.6;


-- ── 2. Scale zone polygons ────────────────────────────────────────────────
-- Polygons are JSONB arrays of [x, y] pairs.

UPDATE kvk_map_zones
SET polygon = (
  SELECT jsonb_agg(
    jsonb_build_array(
      (elem->0)::float * 0.6,
      (elem->1)::float * 0.6
    )
  )
  FROM jsonb_array_elements(polygon) AS elem
);


-- ── 3. Update map dimensions ──────────────────────────────────────────────

UPDATE kvk_maps
SET image_width = 1200,
    image_height = 1200;
