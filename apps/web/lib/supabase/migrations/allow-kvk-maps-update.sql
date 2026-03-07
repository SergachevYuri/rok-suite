-- Re-add UPDATE policy on kvk_maps so the app can update current_stage.
-- The tighten-rls migration removed it, but the stage stepper needs it.
-- Run in Supabase SQL Editor.

CREATE POLICY "Allow public update on kvk_maps"
  ON public.kvk_maps
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
