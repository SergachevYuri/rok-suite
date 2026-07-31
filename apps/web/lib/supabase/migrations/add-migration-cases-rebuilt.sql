-- Auto-detection of "zeroed" and "rebuilt after zero" from location-scan
-- power deltas needs one new pair of columns.  Rebuild is tracked as a flag
-- (timestamp + attributor) rather than a state so zeroed cases don't disappear
-- from the "already handled" filters — a rebuild is metadata on top of zeroed,
-- not a replacement.
--
-- Safe to re-run.

alter table public.migration_cases
  add column if not exists rebuilt_at   timestamptz,
  add column if not exists rebuilt_by   text;

-- Optional index for reviewers filtering the "zeroed & came back" bucket.
create index if not exists migration_cases_rebuilt_idx
  on public.migration_cases (rebuilt_at)
  where rebuilt_at is not null;
