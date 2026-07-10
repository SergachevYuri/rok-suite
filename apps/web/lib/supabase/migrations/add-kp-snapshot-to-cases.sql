-- Snapshot the raw KP and the DKP KP-ratio (kpRatio = totalKP / kpTarget) at the
-- moment a player is added to a cycle, so the cycle table can show how far the
-- player was from passing the DKP target when the case was opened.
--
-- Both columns are nullable — cases opened before this rework, or when no DKP
-- config could be resolved, will leave them NULL and the UI shows a dash.

alter table public.migration_cases
  add column if not exists kp_at_open       bigint,
  add column if not exists kp_ratio_at_open numeric(6,4);
