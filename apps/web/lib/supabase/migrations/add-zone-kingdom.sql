-- Add kingdom assignment to zones (e.g. which kingdom dropped in each outer zone)
ALTER TABLE public.kvk_map_zones ADD COLUMN IF NOT EXISTS kingdom text;
