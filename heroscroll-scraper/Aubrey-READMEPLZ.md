# Heroscroll Scraper

Scrapes kingdom rankings from [heroscroll.com](https://www.heroscroll.com/kingdom-compare?rollupType=top400) and stores snapshots in Supabase. Runs automatically via GitHub Actions 3x daily.

---

## TODO for Supabase Owner

The following steps require **Supabase project admin access**:

### 1. Create the database table

Open **Supabase Dashboard > SQL Editor** and run the contents of [`schema.sql`](schema.sql):

```sql
create table if not exists heroscroll_snapshots (
  id            bigint generated always as identity primary key,
  scraped_at    timestamptz not null default now(),
  data_timestamp date not null,
  kingdom_id    int not null,
  rank          int not null,
  power         bigint not null,
  troop_power   bigint not null,
  killpoints    bigint not null,
  deads         bigint not null,
  hero_scroll_rating numeric(6,2) not null,
  player_count  int not null,
  ch25_count    int not null,
  inactive_player_count int not null,
  domain_count  int not null,
  total_rss_given     bigint not null,
  total_rss_gathered  bigint not null,
  lost_kingdom_most_killed_average bigint not null,
  lost_kingdom_most_lost_average   bigint not null,
  scan_tier     text not null,
  has_heroscrolls boolean not null default false,
  is_active     boolean not null default false,
  service_level text,
  has_dashboard boolean not null default false
);

create index if not exists idx_heroscroll_kingdom_date
  on heroscroll_snapshots (kingdom_id, data_timestamp desc);

create index if not exists idx_heroscroll_scraped_at
  on heroscroll_snapshots (scraped_at desc);

create unique index if not exists idx_heroscroll_unique_snapshot
  on heroscroll_snapshots (kingdom_id, data_timestamp, scraped_at);
```

### 2. Enable Row Level Security (RLS)

After creating the table, enable RLS and add a read policy so the web app (using the anon key) can query the data:

```sql
alter table heroscroll_snapshots enable row level security;

create policy "Allow public read access"
  on heroscroll_snapshots for select
  using (true);
```

### 3. Add GitHub Secrets

Go to the GitHub repo **Settings > Secrets and variables > Actions** and add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Supabase **service_role** key (found in Project Settings > API) |

> The service_role key is used by the scraper (server-side only) to insert data. The web app uses the anon key to read.

---

## How it works

1. GitHub Actions runs the scraper 3x daily (00:00, 12:00, 18:00 Italian time)
2. Fetches the heroscroll kingdom-compare page
3. Extracts the `__NEXT_DATA__` JSON embedded in the HTML
4. Parses the `kingdoms` array (~3000 kingdoms)
5. Inserts all rows into `heroscroll_snapshots` with a `scraped_at` timestamp

---

## Run locally

```bash
cd heroscroll-scraper
pnpm install
pnpm run build

SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_KEY="your-key" pnpm start
```

---

## Querying data from the web app

The web app already has a Supabase client at `lib/supabase/client.ts`. Use it to query `heroscroll_snapshots`.

### Get the latest snapshot (all kingdoms)

```ts
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// Get the most recent scraped_at timestamp
const { data: latest } = await supabase
  .from("heroscroll_snapshots")
  .select("scraped_at")
  .order("scraped_at", { ascending: false })
  .limit(1)
  .single();

// Get all kingdoms from that scrape
const { data: kingdoms } = await supabase
  .from("heroscroll_snapshots")
  .select("*")
  .eq("scraped_at", latest.scraped_at)
  .order("rank", { ascending: true });
```

### Get a specific kingdom's history (for charts)

```ts
// Get all snapshots for kingdom 1093, ordered by date
const { data: history } = await supabase
  .from("heroscroll_snapshots")
  .select("data_timestamp, rank, power, killpoints, hero_scroll_rating, deads, player_count")
  .eq("kingdom_id", 1093)
  .order("data_timestamp", { ascending: true });
```

### Get history for multiple kingdoms (compare chart)

```ts
const kingdomIds = [1093, 3308, 1002];

const { data: compareData } = await supabase
  .from("heroscroll_snapshots")
  .select("kingdom_id, data_timestamp, rank, power, hero_scroll_rating")
  .in("kingdom_id", kingdomIds)
  .order("data_timestamp", { ascending: true });
```

### Get all scan dates available

```ts
const { data: dates } = await supabase
  .from("heroscroll_snapshots")
  .select("data_timestamp")
  .order("data_timestamp", { ascending: false });

// Deduplicate
const uniqueDates = [...new Set(dates.map((d) => d.data_timestamp))];
```

### Get kingdoms for a specific date

```ts
const { data: kingdoms } = await supabase
  .from("heroscroll_snapshots")
  .select("*")
  .eq("data_timestamp", "2026-02-16")
  .order("rank", { ascending: true });
```

### Using fetchAllRows for large result sets (>1000 rows)

The app has a `fetchAllRows` helper in `lib/supabase/client.ts` for paginating past Supabase's 1000-row limit:

```ts
import { createClient, fetchAllRows } from "@/lib/supabase/client";

const supabase = createClient();

// Fetch ALL kingdoms from latest scrape (could be 3000+)
const allKingdoms = await fetchAllRows((range) =>
  supabase
    .from("heroscroll_snapshots")
    .select("*")
    .eq("data_timestamp", "2026-02-16")
    .order("rank", { ascending: true })
    .range(range.from, range.to)
);
```

---

## Table columns reference

| Column | Type | Description |
|---|---|---|
| `id` | bigint | Auto-incrementing primary key |
| `scraped_at` | timestamptz | When the scraper ran |
| `data_timestamp` | date | Scan date from heroscroll |
| `kingdom_id` | int | Kingdom identifier |
| `rank` | int | Kingdom rank in top 400 |
| `power` | bigint | Total power |
| `troop_power` | bigint | Troop power |
| `killpoints` | bigint | Kill points |
| `deads` | bigint | Dead troops |
| `hero_scroll_rating` | numeric(6,2) | Heroscroll rating score |
| `player_count` | int | Total players |
| `ch25_count` | int | City Hall 25 players |
| `inactive_player_count` | int | Inactive players |
| `domain_count` | int | Domains held |
| `total_rss_given` | bigint | RSS given |
| `total_rss_gathered` | bigint | RSS gathered |
| `lost_kingdom_most_killed_average` | bigint | LK avg most killed |
| `lost_kingdom_most_lost_average` | bigint | LK avg most lost |
| `scan_tier` | text | Scan tier |
| `has_heroscrolls` | boolean | Has heroscrolls |
| `is_active` | boolean | Is active kingdom |
| `service_level` | text | Service level (nullable) |
| `has_dashboard` | boolean | Has dashboard |
