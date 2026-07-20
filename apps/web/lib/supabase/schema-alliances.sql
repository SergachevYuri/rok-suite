-- Alliances feature: kingdom alliance standings + manually-assigned roles.
--
-- Two tables back the /alliances page:
--
--   alliance_standings  A single published snapshot (id = 1). Officers refresh
--                       it by uploading a scan CSV and/or an alliance-activity
--                       XLSX, then publishing. The whole `alliances` array is
--                       replaced on each publish (upsert on id = 1).
--   alliance_roles      One row per alliance tag. R5 / Officers / Counselors are
--                       set by hand from the alliance's members. Kept SEPARATE
--                       from standings so they survive re-uploads — role people
--                       are referenced by their stable numeric player id.

create table if not exists public.alliance_standings (
  id int primary key default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  -- The scan/export date this snapshot represents (from the upload filename).
  as_of date,
  -- Human-readable description of what was uploaded (e.g. the filenames).
  source text,
  -- Array of { tag, displayTag, power, members, roster:[{id,name,power}] },
  -- sorted by power desc at write time.
  alliances jsonb not null default '[]'::jsonb,
  -- Enforce the singleton: only ever one row, id = 1.
  constraint alliance_standings_singleton check (id = 1)
);

create table if not exists public.alliance_roles (
  -- Raw in-game alliance tag, kept verbatim (e.g. "'ANG"). Primary key so a
  -- re-upload that keeps the same tag keeps the same roles.
  tag text primary key,
  -- { id, name } | null
  r5 jsonb,
  -- [{ id, name }, ...]
  officers jsonb not null default '[]'::jsonb,
  -- [{ id, name }, ...]
  counselors jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Anyone may read; writes are gated in the UI (officer sign-in), matching the
-- other public tables in this project.
alter table public.alliance_standings enable row level security;
drop policy if exists "Allow public read" on public.alliance_standings;
create policy "Allow public read" on public.alliance_standings for select using (true);
drop policy if exists "Allow public insert" on public.alliance_standings;
create policy "Allow public insert" on public.alliance_standings for insert with check (true);
drop policy if exists "Allow public update" on public.alliance_standings;
create policy "Allow public update" on public.alliance_standings for update using (true);
drop policy if exists "Allow public delete" on public.alliance_standings;
create policy "Allow public delete" on public.alliance_standings for delete using (true);

alter table public.alliance_roles enable row level security;
drop policy if exists "Allow public read" on public.alliance_roles;
create policy "Allow public read" on public.alliance_roles for select using (true);
drop policy if exists "Allow public insert" on public.alliance_roles;
create policy "Allow public insert" on public.alliance_roles for insert with check (true);
drop policy if exists "Allow public update" on public.alliance_roles;
create policy "Allow public update" on public.alliance_roles for update using (true);
drop policy if exists "Allow public delete" on public.alliance_roles;
create policy "Allow public delete" on public.alliance_roles for delete using (true);
