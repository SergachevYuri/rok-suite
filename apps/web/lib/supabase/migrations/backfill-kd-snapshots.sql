-- One-shot backfill: copy the current seeds_kd_stats rows into the new
-- seeds_kd_snapshots audit table so the first upload AFTER enabling snapshots
-- already has a previous data point to delta against in the Comparison view.
--
-- Without this, the very next upload shows "first scan · Xm ago" on every KD
-- because the snapshots table is empty. With it, today's existing scan becomes
-- the baseline and the next upload renders the proper ↑/↓ delta immediately.
--
-- Preserves each row's original uploaded_at where present; falls back to the
-- scan_date itself (treated as midnight UTC) for rows that pre-date the
-- uploaded_at default.
--
-- Run this once, AFTER add-kd-snapshots.sql, and BEFORE the next upload.
-- Safe to run multiple times only if you've truncated seeds_kd_snapshots
-- first — otherwise you'll duplicate entries.

INSERT INTO public.seeds_kd_snapshots
  (uploaded_at, scan_date, kingdom_id, power_400, total_kp, power_rank, kp_rank)
SELECT
  COALESCE(uploaded_at, scan_date::timestamptz),
  scan_date,
  kingdom_id,
  power_400,
  total_kp,
  power_rank,
  kp_rank
FROM public.seeds_kd_stats;
