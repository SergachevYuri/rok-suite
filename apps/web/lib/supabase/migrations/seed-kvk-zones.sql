-- Migration: Seed zone polygon data for S2 Distant Journey map
-- Coordinates are in RoK game space (1200x1200, X: 0→1200, Y: 1200→0)
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
    '[[24,1176],[300,1176],[300,996],[24,996]]'::jsonb,
    '#3b82f6', 0.15);

  -- Clarenci (top center)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Clarenci', 'zone',
    '[[300,1176],[900,1176],[900,996],[300,996]]'::jsonb,
    '#3b82f6', 0.15);

  -- Wei Ji (top-right corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Wei Ji', 'zone',
    '[[900,1176],[1176,1176],[1176,996],[900,996]]'::jsonb,
    '#3b82f6', 0.15);

  -- Leverkusen (right side)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Leverkusen', 'zone',
    '[[900,804],[1176,804],[1176,396],[900,396]]'::jsonb,
    '#3b82f6', 0.15);

  -- Tahiti (bottom-right corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Tahiti', 'zone',
    '[[900,204],[1176,204],[1176,24],[900,24]]'::jsonb,
    '#3b82f6', 0.15);

  -- San Pedro (bottom center)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'San Pedro', 'zone',
    '[[300,204],[900,204],[900,24],[300,24]]'::jsonb,
    '#3b82f6', 0.15);

  -- Lucerne (bottom-left corner)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Lucerne', 'zone',
    '[[24,204],[300,204],[300,24],[24,24]]'::jsonb,
    '#3b82f6', 0.15);

  -- Ceylon (left side)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 1, 'Ceylon', 'zone',
    '[[24,804],[300,804],[300,396],[24,396]]'::jsonb,
    '#3b82f6', 0.15);

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 2 (middle ring) — 4 regions, green
  -- ═══════════════════════════════════════════════════════════════════

  -- Zarata (upper-left)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Zarata', 'zone',
    '[[24,996],[300,996],[300,804],[24,804]]'::jsonb,
    '#22c55e', 0.15);

  -- Havana (upper-right)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Havana', 'zone',
    '[[900,996],[1176,996],[1176,804],[900,804]]'::jsonb,
    '#22c55e', 0.15);

  -- Sacaca (lower-right)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Sacaca', 'zone',
    '[[900,396],[1176,396],[1176,204],[900,204]]'::jsonb,
    '#22c55e', 0.15);

  -- Vila Vila (lower-left)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 2, 'Vila Vila', 'zone',
    '[[24,396],[300,396],[300,204],[24,204]]'::jsonb,
    '#22c55e', 0.15);

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 3 (inner ring) — 4 regions, amber
  -- ═══════════════════════════════════════════════════════════════════

  -- Dimbokro (top)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Dimbokro', 'zone',
    '[[300,996],[900,996],[900,804],[300,804]]'::jsonb,
    '#f59e0b', 0.15);

  -- Ocurí (right)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Ocurí', 'zone',
    '[[708,804],[900,804],[900,396],[708,396]]'::jsonb,
    '#f59e0b', 0.15);

  -- Macha (bottom)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Macha', 'zone',
    '[[300,396],[900,396],[900,204],[300,204]]'::jsonb,
    '#f59e0b', 0.15);

  -- Calcha (left)
  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 3, 'Calcha', 'zone',
    '[[300,804],[492,804],[492,396],[300,396]]'::jsonb,
    '#f59e0b', 0.15);

  -- ═══════════════════════════════════════════════════════════════════
  -- ZONE 4 (center) — King's Land, red
  -- ═══════════════════════════════════════════════════════════════════

  INSERT INTO public.kvk_map_zones (map_id, zone_number, name, zone_type, polygon, color, opacity)
  VALUES (v_map_id, 4, 'King''s Land', 'zone',
    '[[492,804],[708,804],[708,396],[492,396]]'::jsonb,
    '#ef4444', 0.15);

END $$;
