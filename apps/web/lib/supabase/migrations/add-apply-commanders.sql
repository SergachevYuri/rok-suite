-- Commander catalog that powers the /apply page's CommanderPicker.
-- The static lib/sunset-canyon/commander-reference.ts stays around as an
-- archive/fallback (used when the fetch fails or the table is empty), but from
-- now on the picker reads from here so we can add/remove commanders without
-- shipping code.
--
-- Rarity is optional; the picker degrades to a neutral color when absent.
-- image_url is optional too — the picker no longer shows portraits (see commit
-- da019f1) but we keep the column for future reuse.

create table if not exists public.apply_commanders (
  id            text primary key,
  name          text not null,
  specialties   text[] not null default '{}',
  rarity        text check (rarity in ('legendary','epic','elite','advanced')),
  image_url     text,
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now()
);

create index if not exists apply_commanders_name_idx on public.apply_commanders (name);
create index if not exists apply_commanders_rarity_idx on public.apply_commanders (rarity);

alter table public.apply_commanders enable row level security;

drop policy if exists "Allow public read"   on public.apply_commanders;
create policy "Allow public read"   on public.apply_commanders for select using (true);
drop policy if exists "Allow public insert" on public.apply_commanders;
create policy "Allow public insert" on public.apply_commanders for insert with check (true);
drop policy if exists "Allow public update" on public.apply_commanders;
create policy "Allow public update" on public.apply_commanders for update using (true);
drop policy if exists "Allow public delete" on public.apply_commanders;
create policy "Allow public delete" on public.apply_commanders for delete using (true);

-- Bulk seed rows are appended by scripts/build-apply-commanders-sql.mjs into
-- migrations/seed-apply-commanders.sql — running that file is a separate step.
