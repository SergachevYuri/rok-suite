-- Adds 'afk' as a new terminal state for cases where a player is going inactive
-- (but not leaving the kingdom). AFK players are excluded from the active Kingdom
-- Power calculation in the emigration page.
--
-- Run this in the Supabase SQL editor.

alter table public.migration_cases drop constraint if exists migration_cases_state_check;

alter table public.migration_cases add constraint migration_cases_state_check
  check (state in ('pending','claimed','contacted','excepted','migrated','marked_to_zero','zeroed','afk'));

alter table public.migration_cases add column if not exists afk_at timestamptz;
alter table public.migration_cases add column if not exists afk_by text;
