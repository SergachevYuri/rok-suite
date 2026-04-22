-- Two-step exception workflow: officers request an exception with a reason and
-- a suggested yes/no decision; admins then review and either approve (case →
-- excepted) or deny (request is cleared, case stays in its current state).
--
-- Run this in the Supabase SQL editor.

alter table public.migration_cases add column if not exists exception_requested_at timestamptz;
alter table public.migration_cases add column if not exists exception_requested_by text;
alter table public.migration_cases add column if not exists exception_request_reason text;
alter table public.migration_cases add column if not exists exception_suggestion text;

-- Constrain the suggestion to a known set (nullable when no request is pending).
alter table public.migration_cases drop constraint if exists migration_cases_suggestion_check;
alter table public.migration_cases add constraint migration_cases_suggestion_check
  check (exception_suggestion is null or exception_suggestion in ('approve','deny'));
