-- Supabase Storage setup for the /apply page's screenshot uploads.
-- Run once via the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Symptom this fixes:
--   "Screenshot upload failed (roleN_primary_gear): Failed to fetch.
--    Check that the 'leader-applications' Supabase storage bucket exists,
--    is public, and has an INSERT policy for anon."
--
-- Root cause: RLS on storage.objects is on by default; anon uploads from the
-- public /apply form get 401 until an INSERT policy for the bucket exists.

-- 1. Bucket — created public so the returned URLs can be viewed in admin
-- review without a signed-URL round-trip.
insert into storage.buckets (id, name, public)
values ('leader-applications', 'leader-applications', true)
on conflict (id) do update set public = true;

-- 2. Read (public) — anyone with the URL can view uploaded screenshots.
--    The `public = true` on the bucket alone isn't enough with strict RLS;
--    the explicit policy makes SELECT unambiguous.
drop policy if exists "leader-applications public read" on storage.objects;
create policy "leader-applications public read"
  on storage.objects for select
  using (bucket_id = 'leader-applications');

-- 3. Insert (anon) — the /apply page is unauthenticated. Applicants POST
--    their screenshots directly to storage from the browser using the anon
--    key, so anon needs INSERT on this bucket only.
drop policy if exists "leader-applications public insert" on storage.objects;
create policy "leader-applications public insert"
  on storage.objects for insert
  with check (bucket_id = 'leader-applications');

-- 4. Delete (public) — used by the admin panel's "delete application" flow to
--    clean up the associated screenshots. If you'd rather scope this to
--    authenticated admins, replace `true` with an auth.role() check.
drop policy if exists "leader-applications public delete" on storage.objects;
create policy "leader-applications public delete"
  on storage.objects for delete
  using (bucket_id = 'leader-applications');
