-- ============================================================================
-- KVK_ALLOCATION_TARGETS
-- ============================================================================
-- Pre-plan allocation targets: per-alliance target counts for each building
-- group, before specific map buildings are assigned. Small table (~40 rows
-- per map).
--
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kvk_allocation_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  alliance_id uuid NOT NULL REFERENCES public.kvk_alliances(id) ON DELETE CASCADE,
  feature_group text NOT NULL,
  target_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, alliance_id, feature_group)
);

CREATE INDEX IF NOT EXISTS idx_kvk_allocation_targets_map
  ON public.kvk_allocation_targets(map_id);

ALTER TABLE public.kvk_allocation_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_allocation_targets"
  ON public.kvk_allocation_targets FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_allocation_targets"
  ON public.kvk_allocation_targets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_allocation_targets"
  ON public.kvk_allocation_targets FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_allocation_targets"
  ON public.kvk_allocation_targets FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_allocation_targets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_allocation_targets TO authenticated;
