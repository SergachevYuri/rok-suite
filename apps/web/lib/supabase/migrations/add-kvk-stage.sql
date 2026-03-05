-- Add current KvK stage to maps (shared across all officers)
ALTER TABLE public.kvk_maps
  ADD COLUMN IF NOT EXISTS current_stage integer NOT NULL DEFAULT 1;
