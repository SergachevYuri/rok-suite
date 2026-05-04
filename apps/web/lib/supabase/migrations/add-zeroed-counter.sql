-- Track repeated zeroing on Zero List entries.
-- "Confirm Zeroed" closes the case (state → 'zeroed'); some players come back
-- and get zeroed again. Officers want a "Zeroed once" action that records the
-- hit without removing the row from the active queue.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.migration_cases
  ADD COLUMN IF NOT EXISTS zeroed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.migration_cases
  ADD COLUMN IF NOT EXISTS last_zeroed_at timestamptz;

ALTER TABLE public.migration_cases
  ADD COLUMN IF NOT EXISTS last_zeroed_by text;

CREATE INDEX IF NOT EXISTS migration_cases_last_zeroed_at_idx
  ON public.migration_cases (last_zeroed_at DESC);
