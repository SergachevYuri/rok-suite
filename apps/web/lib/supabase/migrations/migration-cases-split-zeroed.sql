-- Updates the migration_cases table to:
--   * remove the unused 'acknowledged' state (rows get rolled back to 'contacted')
--   * split zeroing into 'marked_to_zero' (officer decision) and 'zeroed' (confirmed)
--
-- Run this in the Supabase SQL editor after the initial schema.

-- Roll any 'acknowledged' rows back to 'contacted' so the next CHECK still passes.
update public.migration_cases set state = 'contacted' where state = 'acknowledged';

-- Drop the inline state CHECK so we can replace it with the new set.
alter table public.migration_cases drop constraint if exists migration_cases_state_check;

alter table public.migration_cases add constraint migration_cases_state_check
  check (state in ('pending','claimed','contacted','excepted','migrated','marked_to_zero','zeroed'));

-- New timestamps + actor fields for the 'marked_to_zero' step.
alter table public.migration_cases add column if not exists marked_to_zero_at timestamptz;
alter table public.migration_cases add column if not exists marked_to_zero_by text;
