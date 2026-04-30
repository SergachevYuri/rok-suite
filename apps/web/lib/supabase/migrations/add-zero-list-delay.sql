-- Add 'delay' fields to migration_cases so officers/admins can hold a player
-- back from the Zero List for a window (e.g. give them a chance to leave
-- voluntarily before power members start attacking). Hidden from power tier
-- while delayed_until > now(); officer/admin still see them with a badge.
--
-- Run in the Supabase SQL editor. Idempotent.

alter table public.migration_cases
  add column if not exists delayed_until timestamptz,
  add column if not exists delayed_by    text,
  add column if not exists delayed_reason text;

create index if not exists migration_cases_delayed_idx
  on public.migration_cases (delayed_until)
  where delayed_until is not null;
