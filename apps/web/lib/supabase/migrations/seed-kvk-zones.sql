-- Migration: Seed zone polygon data for S2 Distant Journey map
-- Coordinates are in Leaflet CRS.Simple space (2000x2000, origin bottom-left)
-- Polygons stored as [[x,y], ...] arrays, clockwise from top-left

-- Get the active map ID
DO $$
DECLARE
  v_map_id uuid;
BEGIN
  SELECT id INTO v_map_id FROM public.kvk_maps
  ORDER BY created_at DESC LIMIT 1;

  IF v_map_id IS NULL THEN
    RAISE EXCEPTION 'No active map found';
  END IF;

  -- Clear existing zones for this map
  DELETE FROM public.kvk_map_zones WHERE map_id = v_map_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 1 (outer ring) — 8 regions, blue
  -- ═══════════════════════════════════════════════════════════════════

  -- Benguela (top-left corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Benguela', 'zone',
    '[[40,1960],[500,1960],[500,1660],[40,1660]]'::jsonb,
    '#3b82f6', 0.15);

  -- Clarenci (top center)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Clarenci', 'zone',
    '[[500,1960],[1500,1960],[1500,1660],[500,1660]]'::jsonb,
    '#3b82f6', 0.15);

  -- Wei Ji (top-right corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Wei Ji', 'zone',
    '[[1500,1960],[1960,1960],[1960,1660],[1500,1660]]'::jsonb,
    '#3b82f6', 0.15);

  -- Leverkusen (right side)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Leverkusen', 'zone',
    '[[1500,1340],[1960,1340],[1960,660],[1500,660]]'::jsonb,
    '#3b82f6', 0.15);

  -- Tahiti (bottom-right corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Tahiti', 'zone',
    '[[1500,340],[1960,340],[1960,40],[1500,40]]'::jsonb,
    '#3b82f6', 0.15);

  -- San Pedro (bottom center)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'San Pedro', 'zone',
    '[[500,340],[1500,340],[1500,40],[500,40]]'::jsonb,
    '#3b82f6', 0.15);

  -- Lucerne (bottom-left corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Lucerne', 'zone',
    '[[40,340],[500,340],[500,40],[40,40]]'::jsonb,
    '#3b82f6', 0.15);

  -- Ceylon (left side)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Ceylon', 'zone',
    '[[40,1340],[500,1340],[500,660],[40,660]]'::jsonb,
    '#3b82f6', 0.15);

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 2 (middle ring) — 4 regions, green
  -- ═══════════════════════════════════════════════════════════════════

  -- Zarata (upper-left)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Zarata', 'zone',
    '[[40,1660],[500,1660],[500,1340],[40,1340]]'::jsonb,
    '#22c55e', 0.15);

  -- Havana (upper-right)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Havana', 'zone',
    '[[1500,1660],[1960,1660],[1960,1340],[1500,1340]]'::jsonb,
    '#22c55e', 0.15);

  -- Sacaca (lower-right)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Sacaca', 'zone',
    '[[1500,660],[1960,660],[1960,340],[1500,340]]'::jsonb,
    '#22c55e', 0.15);

  -- Vila Vila (lower-left)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Vila Vila', 'zone',
    '[[40,660],[500,660],[500,340],[40,340]]'::jsonb,
    '#22c55e', 0.15);

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 3 (inner ring) — 4 regions, amber
  -- ═══════════════════════════════════════════════════════════════════

  -- Dimbokro (top)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Dimbokro', 'zone',
    '[[500,1660],[1500,1660],[1500,1340],[500,1340]]'::jsonb,
    '#f59e0b', 0.15);

  -- Ocurí (right)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Ocurí', 'zone',
    '[[1180,1340],[1500,1340],[1500,660],[1180,660]]'::jsonb,
    '#f59e0b', 0.15);

  -- Macha (bottom)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Macha', 'zone',
    '[[500,660],[1500,660],[1500,340],[500,340]]'::jsonb,
    '#f59e0b', 0.15);

  -- Calcha (left)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Calcha', 'zone',
    '[[500,1340],[820,1340],[820,660],[500,660]]'::jsonb,
    '#f59e0b', 0.15);

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 4 (center) — King's Land, red
  -- ═══════════════════════════════════════════════════════════════════

  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 4, 'King''s Land', 'zone',
    '[[820,1340],[1180,1340],[1180,660],[820,660]]'::jsonb,
    '#ef4444', 0.15);

END $$;
