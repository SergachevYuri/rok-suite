-- Rally / Garrison leader applications submitted from the public /apply page.
-- One application row per submission; one role row per (unit_type, role_type) pair
-- the applicant volunteers for, each with primary + secondary commander screenshots.
--
-- Screenshots are stored in the public Supabase storage bucket "leader-applications".
-- Create the bucket once via the dashboard or:
--   insert into storage.buckets (id, name, public) values ('leader-applications','leader-applications', true);

create table if not exists public.leader_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kingdom text not null,
  name text not null,
  gov_id text not null,
  discord text,
  notes text,
  locale text,
  status text not null default 'pending'
    check (status in ('pending','reviewed','approved','rejected'))
);

create index if not exists leader_applications_created_at_idx
  on public.leader_applications (created_at desc);
create index if not exists leader_applications_kingdom_idx
  on public.leader_applications (kingdom);

create table if not exists public.leader_application_roles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.leader_applications(id) on delete cascade,
  position int not null default 0,
  unit_type text not null check (unit_type in ('infantry','archer','cavalry')),
  role_type text not null check (role_type in ('rally','garrison')),
  primary_commander_id text,
  primary_commander_name text,
  secondary_commander_id text,
  secondary_commander_name text,
  primary_screenshot_url text,
  secondary_screenshot_url text
);

-- Adds commander columns to pre-existing installations. Safe to re-run.
alter table public.leader_application_roles
  add column if not exists primary_commander_id text,
  add column if not exists primary_commander_name text,
  add column if not exists secondary_commander_id text,
  add column if not exists secondary_commander_name text;

create index if not exists leader_application_roles_app_idx
  on public.leader_application_roles (application_id);

alter table public.leader_applications enable row level security;
drop policy if exists "Allow public read" on public.leader_applications;
create policy "Allow public read" on public.leader_applications for select using (true);
drop policy if exists "Allow public insert" on public.leader_applications;
create policy "Allow public insert" on public.leader_applications for insert with check (true);
drop policy if exists "Allow public update" on public.leader_applications;
create policy "Allow public update" on public.leader_applications for update using (true);
drop policy if exists "Allow public delete" on public.leader_applications;
create policy "Allow public delete" on public.leader_applications for delete using (true);

alter table public.leader_application_roles enable row level security;
drop policy if exists "Allow public read" on public.leader_application_roles;
create policy "Allow public read" on public.leader_application_roles for select using (true);
drop policy if exists "Allow public insert" on public.leader_application_roles;
create policy "Allow public insert" on public.leader_application_roles for insert with check (true);
drop policy if exists "Allow public update" on public.leader_application_roles;
create policy "Allow public update" on public.leader_application_roles for update using (true);
drop policy if exists "Allow public delete" on public.leader_application_roles;
create policy "Allow public delete" on public.leader_application_roles for delete using (true);
