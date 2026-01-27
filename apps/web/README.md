# ROK Suite Web App

Strategy tools and battle planning for Rise of Kingdoms.

**Live Site: [rok-suite.vercel.app](https://rok-suite.vercel.app)**

---

## Features

### Alliance Roster (`/roster`)
Comprehensive member tracking and growth analysis dashboard:
- **Member data** — power, kill points (T4/T5 breakdown), honor points, role, tier, alliance tags
- **Historical snapshots** — daily snapshots stored in Supabase with date comparison
- **Growth tables** — KP Growth, Power Growth, and Honor Growth with gradient bar graphs
- **Member history** — click any member to see line charts of their stats over time
- **Customizable columns** — toggle 17+ metrics across core, combat, support, events, and profile categories
- **Name change handling** — `alternate_names` arrays and `merged_into` FK for tracking renames and account merges
- **Bulk operations** — CSV/JSON import, member merge, deactivation, tag management
- **Advanced sorting & filtering** — sort by any column, search by name, filter by role

### Alliance Events (`/events`)
Event hub for alliance-wide challenges:
- **KP Push Challenge** (Jan 2026) — leaderboard tracking KP gains, power changes, and P/KP ratio
- **Top 3 podium** with gold/silver/bronze accent styling
- **KP distribution bar chart** showing gain spread across all participants
- **Rankings table** with gradient bar graphs for KP and Power columns
- **Leadership table** (R4/R5) with expandable rows, same visual treatment as rankings
- **Expandable snapshot history** — click any row to see date-by-date data + sparkline charts
- **P/KP ratio tracking** — start → end ratio with delta indicator, Best Ratio Gain card

### Alliance Calendar (`/calendar`)
Google Calendar integration:
- **Embedded calendar** for alliance events (AoO training, KvK schedules, rallies)
- **Multi-timezone support** — UTC, US Eastern/Pacific, UK, Europe, Asia-Pacific, Australia
- **iCal subscription URLs** for Apple Calendar, Outlook, and other apps

### Ark of Osiris Strategy Planner (`/aoo-strategy`)
30v30 battle planning tool with:
- **3-Zone Team System** - Blue (Zone 1), Orange (Zone 2), Purple (Zone 3) matching in-game colors
- **Interactive Battle Map** - 18 strategic buildings with phase-based attack orders
- **Corner Swap Toggle** - Mirror strategy for different spawn positions (top-left vs bottom-right)
- **Training Availability Polls** - Multi-day/time polls with drag-to-select, timezone conversion, and image export
- **Roster Management** - Import players from CSV, track power, auto-assign teleport waves
- **Player Role Tags** - Rally Leader, Coordinator, Teleport 1st/2nd
- **Per-Zone Export** - Copy strategy text for each zone to share in Discord
- **Real-time Data Sync** - Supabase backend for persistence

### Sunset Canyon Simulator (`/sunset-canyon`)
5v5 defensive formation optimizer with:
- **Commander Roster** - Full stats tracking (level, stars, skills, talents)
- **JSON Import** - Bulk import commanders from JSON files with format documentation
- **Screenshot Scanner** - OCR (Tesseract.js) + Vision AI (Roboflow) for bulk import
- **Formation Optimizer** - Multi-layered scoring with primary/secondary position preferences
- **Meta Synergies** - Based on research from ROK community guides
- **Win Rate Analysis** - Synergy-based probability estimates

### Upgrade Calculator (`/upgrade-calculator`)
City Hall progression planner with:
- **Dependency Graph** - Interactive SVG visualization with pan/zoom
- **List View** - Collapsible tree with +/- controls
- **Resource Calculator** - Food, Wood, Stone, Gold totals
- **Speed Bonuses** - VIP levels 0-17 and custom bonuses
- **All 20+ Buildings** - Levels 1-25 with smart defaults

### Game Guides (`/guide`)
Comprehensive strategy guides:
- **Event Guides** - Solo, alliance, co-op PvE, and PvP events
- **Alliance Protocols** - Guardian runs, rally procedures, territory management
- **Commander Progression** - F2P and P2P paths with efficiency tips
- **Checklists** - Preparation and execution steps with rewards info

### Beta Tools (`/beta-tools`)
Experimental features hub for testing scanners, simulators, and calculators.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS 4
- **Icons:** Lucide React
- **Charts:** Recharts (bar charts, line charts, sparklines)
- **Database:** Supabase (PostgreSQL + real-time)
- **Auth:** Supabase (Discord & Google OAuth)
- **OCR:** Tesseract.js
- **Vision AI:** Roboflow
- **State:** Zustand + localStorage
- **Hosting:** Vercel

---

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `alliance_roster` | Active members — name, power, kills, t4/t5 kills, honor, role, tier, tags, alternate_names, merged_into |
| `roster_snapshots` | Daily snapshots — member_name, snapshot_date, power, kills, t4/t5 kills, honor_points, is_active |
| `roster_daily_totals` | Aggregated daily stats (database view) — member_count, total_power, total_kills, avg_power |
| `event_participation` | Event tracking — member_name, event_type (aoo/mobilization), event_date, team, score |
| `aoo_strategy` | AoO player assignments, map positions, and roster data |
| `training_polls` | Training availability polls with multi-day/time support |
| `poll_responses` | Individual poll responses with voter tracking |

### Key Supabase Patterns

- **`fetchAllRows()`** (`lib/supabase/client.ts`) — auto-paginates past Supabase's 1,000-row limit
- **`use-roster-snapshots.ts`** — data layer for snapshots, growth tracking, name resolution, and member history
- **Name resolution** — canonical name mapping handles `alternate_names`, `merged_into`, and normalized tag matching

---

## Development

### Prerequisites
- Node.js 20+
- pnpm 9+

### Setup
```bash
# From repo root
pnpm install

# Create environment file
cp .env.local.example .env.local
# Edit .env.local with your keys
```

### Run locally
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
# Required - Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Required for admin scripts
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional - Roboflow (screenshot scanning)
NEXT_PUBLIC_ROBOFLOW_API_KEY=your-api-key
NEXT_PUBLIC_ROBOFLOW_WORKSPACE=your-workspace
NEXT_PUBLIC_ROBOFLOW_WORKFLOW=your-workflow-id
NEXT_PUBLIC_ROBOFLOW_PROJECT=your-project
```

---

## Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Run production server
pnpm lint         # Run ESLint
```

### Roster Management Scripts

```bash
# Generate SQL from roster CSV
NEXT_PUBLIC_SUPABASE_URL="..." NEXT_PUBLIC_SUPABASE_ANON_KEY="..." \
  npx tsx scripts/generate-sql.ts

# Seed roster directly to Supabase
NEXT_PUBLIC_SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
  npx tsx scripts/seed-aoo-roster.ts

# Check snapshot data for specific members and dates
NEXT_PUBLIC_SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
  npx tsx scripts/check-snapshot.ts
```

---

## Deployment

Auto-deploys to Vercel on push to `main`.

---

## License

MIT

---

**Angmar Nazgul Guards** • Rise of Kingdoms
