-- Schema for Event Participation Tracking
-- Run this in your Supabase SQL Editor

drop table if exists public.event_participation cascade;

create table public.event_participation (
  id uuid default gen_random_uuid() primary key,

  -- Event info
  member_name text not null,              -- Links to roster by name (denormalized)
  event_type text not null,               -- 'aoo' or 'mobilization'
  event_date date not null,               -- When the event happened

  -- AoO specific fields
  team text,                              -- 'Team 1' or 'Team 2' (null for mobilization)
  participated boolean default true,      -- Did they participate? (false = assigned but no-show)

  -- Mobilization specific fields
  score bigint,                           -- Individual points in the event (null for AoO)
  turned_in integer,                      -- Resources turned in (mobilization only)
  accepted integer,                       -- Resources accepted (mobilization only)

  -- Metadata
  notes text,                             -- Optional notes
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Constraints
  constraint event_type_check check (event_type in ('aoo', 'mobilization')),
  constraint team_check check (team is null or team in ('Team 1', 'Team 2')),
  unique(member_name, event_type, event_date)
);

-- Indexes
create index event_participation_member_idx on public.event_participation(member_name);
create index event_participation_type_date_idx on public.event_participation(event_type, event_date desc);
create index event_participation_date_idx on public.event_participation(event_date desc);

-- RLS
alter table public.event_participation enable row level security;

drop policy if exists "Anyone can view events" on public.event_participation;
create policy "Anyone can view events"
  on public.event_participation for select
  using (true);

drop policy if exists "Allow anon insert events" on public.event_participation;
create policy "Allow anon insert events"
  on public.event_participation for insert
  with check (true);

drop policy if exists "Allow anon update events" on public.event_participation;
create policy "Allow anon update events"
  on public.event_participation for update
  using (true);

drop policy if exists "Allow anon delete events" on public.event_participation;
create policy "Allow anon delete events"
  on public.event_participation for delete
  using (true);

-- Grants
grant select, insert, update, delete on public.event_participation to anon;
grant select, insert, update, delete on public.event_participation to authenticated;
