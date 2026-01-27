# Alliance Roster

Track your alliance members' growth over time with daily snapshots, visual analytics, and comprehensive member management.

## Overview

The Alliance Roster (`/roster`) is a multi-tab dashboard for managing alliance members and analyzing growth trends. Data is stored in **Supabase** (PostgreSQL) with real-time sync and auto-pagination for large datasets.

## Tabs

### Roster Tab

The main roster table displays all active alliance members with configurable columns across five categories:

| Category | Columns |
|----------|---------|
| **Core** | Power, Kill Points, Power:KP Ratio, Rank, Alliance |
| **Combat** | T4/T5 KP, T1/T2/T3 KP, Deaths, Troops Healed |
| **Events** | Honor Points, AoO, Mobilization, Acclaim, KvK Points |
| **Profile** | Peak Power, Castle Hall level, Civilization |
| **Support** | Notes, Tags, Role |

- **Column visibility** is configurable via the View Options toggle
- **Sorting** by any column with ascending/descending toggle
- **Search** by name with real-time filtering
- **Filters** by tag, alliance, rank, and AoO team assignment
- **Pagination** with configurable rows per page (10, 15, 25, 50, All)

### Growth Tables

Three growth tables track member progression over time:

#### KP Growth
- First recorded KP vs. current KP
- All-time growth with percentage
- Date-range comparison growth (configurable start date)
- Gradient bar graphs showing relative growth magnitude

#### Power Growth
- Same structure as KP Growth for power metric
- Percentage and absolute growth values
- Date-range comparison support

#### Honor Growth
- Honor points progression tracking
- Fixed-width columns for readability
- ANG tag badges for founding members

**Growth Calculation Logic:**
- **Entry** = first recorded non-zero value for that metric
- **All-Time Growth** = current value - first entry value
- **Comparison Growth** = current value - compare date value
- Handles name changes via variant mapping (alternate names, merged members)

### History Charts

Two chart modes for visualizing trends:

#### Alliance Mode
- Aggregate alliance performance trends over time
- Line charts with date-based X-axis

#### Individual Mode
- Search for a specific member to view their personal history
- Click any member name in growth tables to auto-select
- Tracks all snapshots across name variants

**Available Metrics:** All, KP, Power, Honor, Power:KP Ratio

### Activity Scoring

A weighted scoring system (0-100) ranks members by overall activity:

| Metric | Default Weight |
|--------|---------------|
| Kill Points | 50% |
| Power | 20% |
| Honor | 10% |
| AoO Participation | 10% |
| Mobilization | 10% |

- Top 20 leaderboard with stacked bar charts
- Color-coded bars: red (KP), blue (Power), orange (Honor), green (AoO), purple (Mob)
- Weights are configurable in editor mode

## Snapshots

Snapshots capture the full roster state at a point in time.

### How Snapshots Work

Each snapshot records per-member:
- Power, Kill Points, T4/T5 Kills, Honor Points
- Role, Active status
- Snapshot date

### Creating Snapshots

- **Auto-snapshot**: Triggered after CSV roster import
- **Manual snapshot**: "Create Snapshot" button saves current state
- **Upsert pattern**: Multiple snapshots per day update existing records (keyed on `snapshot_date` + `member_name`)

### Snapshot Data Uses

- Growth table calculations (earliest vs. latest values)
- History charts (individual and alliance trends)
- Event participation tracking (start/end date comparisons)
- Membership change detection (joins and leaves)

## Member Management

### Editor Mode

Password-protected editing with:
- Inline editing of KP, Honor, Notes, and Role fields
- Decimal support for values stored in millions
- Auto-snapshot on edit exit for data preservation

### CSV Import

- Bulk import roster data from CSV files
- Automatic member matching and upsert
- Import status reporting (updated/inserted counts)
- Auto-creates snapshot after successful import

### Name Change Handling

The roster tracks name changes through two mechanisms:

- **`alternate_names`**: Array of previous names for a member
- **`merged_into`**: Foreign key pointing to the canonical member record when accounts are consolidated

Name resolution normalizes alliance tag prefixes (e.g., `[ANG]`, `ᵃⁿᵍ`, `ᴬ`) and performs case-insensitive matching with a 1-minute cache.

### Duplicate Detection

- Identifies potential duplicate members (same governor)
- Groups duplicates for review
- Merge tool consolidates records into a primary member using `merged_into`

## Supabase Schema

| Table | Purpose |
|-------|---------|
| `alliance_roster` | Active members — name, power, kills, t4/t5 kills, honor, role, tier, tags, alternate_names, merged_into |
| `roster_snapshots` | Daily snapshots — member_name, snapshot_date, power, kills, t4/t5 kills, honor_points, is_active |
| `roster_daily_totals` | Aggregated daily stats (database view) — member_count, total_power, total_kills, avg_power |

### Key Patterns

- **`fetchAllRows()`** in `lib/supabase/client.ts` auto-paginates past Supabase's 1,000-row limit
- **`use-roster-snapshots.ts`** provides the data layer for snapshots, growth tracking, name resolution, and member history
- **Name resolution** maps canonical names across `alternate_names`, `merged_into`, and normalized tag matching
