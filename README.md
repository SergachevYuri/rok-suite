# Rise of Kingdoms Strategy Suite

A comprehensive toolkit for **Rise of Kingdoms** kingdom and alliance management — roster tracking, KvK war room, event planning, and more.

<table>
<tr>
<td align="center" width="50%">

### [Live App](https://rok-suite-web.vercel.app)
Start using the tools now

</td>
<td align="center" width="50%">

### [Documentation](https://avweigel.github.io/rok-suite/)
Learn how it works

</td>
</tr>
</table>

---

## Features

### KvK War Room (`/kvk-map`)
- **Interactive strategy map** — Leaflet-based map overlay for KvK zone planning
- **Feature assignment** — assign zones, passes, altars, and objectives to alliances
- **Achievement progress tracking** — live computation of Crusader/KvK2 achievement progress per alliance and kingdom-wide
- **Strategy notes** — per-feature strategy text with officer/admin role gating
- **Zone polygon drawing** — admin tool to define custom map zones
- **Multi-season support** — Crusader and KvK Season 2 achievement datasets

### Kingdom Management (`/kingdom`)
- **Migration Tracker** — upload kingdom scans, cross-reference Google Sheets migrant/inactive lists, classify players as Original/Accepted/Pending/Inactive/Illegal
- **Alliance Sorter** — auto-assign players to alliances based on power/KP thresholds with drag-and-drop board view
- **Wanted List** — track flagged players with officer mark-as-zeroed/left workflow
- **Kingdom Stats** — aggregate kingdom-level statistics

### Alliance Roster (`/roster`)
- **Full member tracking** with power, kill points (T4/T5), honor points, role, and alliance tags
- **Historical snapshots** stored in Supabase — create daily snapshots and compare growth over time
- **Growth tables** for KP, Power, and Honor with bar graphs and percentage-based comparisons
- **Member history** with line charts showing stat trends across snapshot dates
- **Name change handling** via `alternate_names` arrays and `merged_into` foreign keys
- **Customizable columns** — toggle 17+ metrics across core, combat, support, events, and profile categories
- **Bulk operations** — CSV/JSON import, bulk event recording, member merge/deactivation

### Alliance Events (`/events`)
- **Event hub** listing active, completed, and upcoming alliance challenges
- **KP Push Challenge** — track KP gains, power changes, and P/KP ratio improvement per member
- **Top 3 podium** with gold/silver/bronze styling and KP distribution bar chart
- **Expandable rows** with snapshot history tables and sparkline growth charts

### MGE & Recognition (`/mge`, `/recognition`)
- **MGE tracking** with officer-managed event brackets
- **Recognition board** for alliance achievements and awards

### Alliance Calendar (`/calendar`)
- **Google Calendar embed** for alliance events
- **Multi-timezone support** — UTC, US Eastern/Pacific, UK, Europe, Asia-Pacific, Australia
- **Calendar subscription** with iCal URLs for Apple Calendar, Outlook, and other apps

### Ark of Osiris Strategy (`/aoo-strategy`)
- **30v30 team assignments** with 3-zone system (Blue/Orange/Purple matching in-game colors)
- **Interactive battle map** with 18 strategic buildings and phase-based attack planning
- **Corner swap toggle** to mirror strategy for different spawn positions
- **Training availability polls** with drag-to-select UI, timezone conversion, and image export
- **Roster management** with power tracking and automatic teleport wave assignments
- **Copyable strategy guides** with per-zone exports for Discord/game chat

### Sunset Canyon Simulator (`/sunset-canyon`)
- **Commander roster management** with full stats (level, stars, skills, talents)
- **Screenshot scanner** using OCR (Tesseract.js) + Vision AI (Roboflow) to bulk-import commanders
- **Formation optimizer** that recommends optimal 5-commander defensive lineups
- **Win rate analysis** based on commander synergies, positioning, and meta pairings

> **[Read the Docs](https://avweigel.github.io/rok-suite/#/sunset-canyon/README)** — Algorithm details, commander pairings, and formation strategies.

### Upgrade Calculator (`/upgrade-calculator`)
- **Building dependency graph** showing all prerequisites for City Hall upgrades
- **Interactive visualization** with pan, zoom, and click-to-edit
- **Resource calculator** with VIP speed bonuses (0-17) and custom bonuses

### Game Guides (`/guide`)
- **Event guides** for solo, alliance, co-op PvE, and PvP events
- **Commander progression** paths for F2P and P2P players
- **Checklists and strategies** with preparation steps and rewards info

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Database | Supabase (PostgreSQL with real-time subscriptions) |
| Maps | Leaflet with custom CRS for image overlays |
| Charts | Recharts (bar charts, line charts, sparklines) |
| OCR | Tesseract.js (text extraction) |
| Vision AI | Roboflow (commander detection, screenshot scanning) |
| AI | Google Gemini (RoK Mail generation) |
| State | Zustand + localStorage persistence |
| Deployment | Vercel (app), GitHub Pages (docs) |

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/avweigel/rok-suite.git
cd rok-suite

# Install dependencies
pnpm install

# Set up environment variables
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local with your Supabase keys and passwords

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Environment Variables

Create `apps/web/.env.local` from the example template:

```env
# Required — Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required — Auth passwords (client-side role gating for admin/officer features)
NEXT_PUBLIC_ADMIN_PASSWORD=your_admin_password
NEXT_PUBLIC_OFFICER_PASSWORD=your_officer_password

# Optional — Roboflow Vision AI (for screenshot scanning)
NEXT_PUBLIC_ROBOFLOW_API_KEY=your_roboflow_api_key
NEXT_PUBLIC_ROBOFLOW_WORKSPACE=your_workspace
NEXT_PUBLIC_ROBOFLOW_WORKFLOW=your_workflow_id
NEXT_PUBLIC_ROBOFLOW_PROJECT=your_project

# Optional — Google Gemini AI (for RoK Mail generation)
GEMINI_API_KEY=your_gemini_api_key
```

---

## Data Privacy

Roster data, kingdom scans, and player statistics are stored in your own Supabase instance and are **not** committed to the repository. The `apps/web/data/` directory is gitignored for CSV, SQL, XLSX, and other data files. Only static game data (achievement definitions, equipment lists) is tracked in version control.

---

## Supabase Schema

The app uses the following core Supabase tables:

| Table | Purpose |
|-------|---------|
| `alliance_roster` | Active member data — name, power, kills, t4/t5 kills, honor, role, tier, tags |
| `roster_snapshots` | Daily historical snapshots — power, kills, honor per member per date |
| `roster_daily_totals` | Aggregated daily stats (database view) |
| `event_participation` | Event tracking — member, event type, date, team, score |
| `aoo_strategy` | AoO player assignments, map positions, and roster data |
| `training_polls` / `poll_responses` | Training availability polls |
| `kingdom_scans` / `scan_players` | Kingdom-wide scan data for migration tracker |
| `kvk_maps` / `kvk_features` / `kvk_assignments` | KvK war room map data |
| `kvk_alliances` / `kvk_strategies` | KvK alliance assignments and strategy notes |
| `wanted_list` / `wanted_status` | Wanted player tracking with officer marks |
| `sorter_versions` | Saved alliance sorter configurations |

### Key Patterns

- **Name changes**: Members have `alternate_names` (text array) and `merged_into` (FK) for tracking renames and account merges.
- **Pagination**: `fetchAllRows()` in `lib/supabase/client.ts` auto-paginates past Supabase's 1,000-row limit.
- **Snapshot comparison**: Growth tables compare latest vs selected earlier snapshot date.

---

## Repository Structure

```
rok-suite/
├── apps/
│   └── web/                     # Next.js web application
│       ├── app/                 # App router pages
│       │   ├── roster/          # Alliance roster & snapshot tracking
│       │   ├── events/          # Alliance events & challenges
│       │   ├── calendar/        # Google Calendar integration
│       │   ├── kingdom/         # Migration tracker, sorter, wanted list
│       │   ├── kvk-map/         # KvK war room & strategy map
│       │   ├── mge/             # MGE event tracking
│       │   ├── recognition/     # Alliance recognition board
│       │   ├── aoo-strategy/    # Ark of Osiris planner
│       │   ├── sunset-canyon/   # Canyon simulator
│       │   ├── upgrade-calculator/  # Building calculator
│       │   └── guide/           # Event & alliance guides
│       ├── components/          # React components
│       ├── lib/                 # Shared utilities
│       │   ├── supabase/        # Supabase client & data hooks
│       │   ├── kvk-map/         # War room map logic
│       │   ├── kvk-achievements/ # Achievement progress computation
│       │   ├── kingdom/         # Kingdom management utilities
│       │   └── guide/           # Guide data and theme utilities
│       └── data/                # Static game data (JSON only — player data is gitignored)
├── packages/
│   ├── sim-engine/              # Battle simulator engine
│   ├── map-optimizer/           # Map placement optimizer (Python)
│   ├── vision/                  # Image/OCR utilities (Python)
│   ├── shared-schema/           # JSON schemas
│   └── shared-data/             # Commander/gear data
└── docs/                        # Documentation (GitHub Pages)
```

---

## Contributing

PRs are welcome for:
- Bug fixes
- Data corrections (building requirements, commander stats, event info)
- New features that benefit RoK alliances and kingdoms
- Documentation improvements

---

## Documentation

Full documentation is available at **[avweigel.github.io/rok-suite](https://avweigel.github.io/rok-suite/)**

| Guide | Description |
|-------|-------------|
| [Quick Start](https://avweigel.github.io/rok-suite/#/quickstart) | Get started with the tools |
| [Roster Management](https://avweigel.github.io/rok-suite/#/roster/README) | Member tracking and growth analysis |
| [Alliance Events](https://avweigel.github.io/rok-suite/#/events/README) | Event challenges and leaderboards |
| [AoO Strategy](https://avweigel.github.io/rok-suite/#/aoo-strategy/README) | 30v30 battle planning |
| [Sunset Canyon](https://avweigel.github.io/rok-suite/#/sunset-canyon/README) | Formation optimizer |
| [Upgrade Calculator](https://avweigel.github.io/rok-suite/#/upgrade-calculator/README) | Building dependencies |

---

## License

MIT

---

*Built with help from Claude Code*
