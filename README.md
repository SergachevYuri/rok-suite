# Rise of Kingdoms Strategy Suite

A comprehensive toolkit for **Rise of Kingdoms** strategy planning, built for the **Angmar Nazgul Guards** alliance.

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

### Alliance Roster (`/roster`)
- **Full member tracking** with power, kill points (T4/T5), honor points, role, and alliance tags
- **Historical snapshots** stored in Supabase — create daily snapshots and compare growth over time
- **Growth tables** for KP, Power, and Honor with bar graphs and percentage-based comparisons
- **Member history** with line charts showing stat trends across snapshot dates
- **Name change handling** via `alternate_names` arrays and `merged_into` foreign keys
- **Customizable columns** — toggle 17+ metrics across core, combat, support, events, and profile categories
- **Bulk operations** — CSV/JSON import, bulk event recording, member merge/deactivation
- **Pagination helper** (`fetchAllRows`) to auto-paginate past Supabase's 1,000-row limit

### Alliance Events (`/events`)
- **Event hub** listing active, completed, and upcoming alliance challenges
- **KP Push Challenge** — track KP gains, power changes, and P/KP ratio improvement per member
- **Top 3 podium** with gold/silver/bronze styling and KP distribution bar chart
- **Expandable rows** with snapshot history tables and sparkline growth charts (Power, KP, T4, T5)
- **Leadership table** with the same expand/bar-graph treatment as the main rankings
- **Best Ratio Gain** highlighting — identifies who improved their P/KP ratio most

### Alliance Calendar (`/calendar`)
- **Google Calendar embed** for alliance events (AoO training, KvK, rallies)
- **Multi-timezone support** — UTC, US Eastern/Pacific, UK, Europe, Asia-Pacific, Australia
- **Calendar subscription** with iCal URLs for Apple Calendar, Outlook, and other apps

### Ark of Osiris Strategy (`/aoo-strategy`)
- **30v30 team assignments** with 3-zone system (Blue/Orange/Purple matching in-game colors)
- **Interactive battle map** with 18 strategic buildings and phase-based attack planning
- **Corner swap toggle** to mirror strategy for different spawn positions
- **Training availability polls** with drag-to-select UI, timezone conversion, and image export
- **Roster management** with power tracking and automatic teleport wave assignments
- **Copyable strategy guides** with per-zone exports for Discord/game chat
- **Player role tags**: Rally Leader, Coordinator, Teleport 1st/2nd

### Sunset Canyon Simulator (`/sunset-canyon`)
- **Commander roster management** with full stats (level, stars, skills, talents)
- **JSON import** to bulk-import commanders from JSON files (with format documentation)
- **Screenshot scanner** using OCR (Tesseract.js) + Vision AI (Roboflow) to bulk-import commanders
- **Formation optimizer** that recommends optimal 5-commander defensive lineups
- **Primary/secondary position logic** - Commanders assigned to correct roles based on talent tree value
- **Win rate analysis** based on commander synergies, positioning, and meta pairings
- **Multi-layered scoring**: Commander Power → Primary/Secondary Position → Meta Synergies → AOE Coverage → Troop Balance

> **[Read the Docs](https://avweigel.github.io/rok-suite/#/sunset-canyon/README)** — Algorithm details, commander pairings, and formation strategies.

### Upgrade Calculator (`/upgrade-calculator`)
- **Building dependency graph** showing all prerequisites for City Hall upgrades
- **Interactive visualization** with pan, zoom, and click-to-edit
- **Complete dependency tree** for all 20+ buildings from levels 1-25
- **Resource calculator** with VIP speed bonuses (0-17) and custom bonuses
- **Smart defaults** based on current City Hall level

### Game Guides (`/guide`)
- **Event guides** for solo, alliance, co-op PvE, and PvP events
- **Alliance protocols** for guardians, rallies, and territory management
- **Commander progression** paths for F2P and P2P players
- **Checklists and strategies** with preparation steps and rewards info

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Auth | Supabase (Discord & Google OAuth) |
| Database | Supabase (PostgreSQL with real-time subscriptions) |
| Charts | Recharts (bar charts, line charts, sparklines) |
| OCR | Tesseract.js (text extraction) |
| Vision AI | Roboflow (commander detection, screenshot scanning) |
| State | Zustand + localStorage persistence |
| Deployment | Vercel (app), GitHub Pages (docs) |

---

## Repository Structure

```
rok-suite/
├── apps/
│   └── web/                     # Next.js web application
│       ├── app/                 # App router pages
│       │   ├── roster/          # Alliance roster & snapshot tracking
│       │   ├── events/          # Alliance events & challenges
│       │   │   └── kp-push-jan-2026/  # KP Push event page
│       │   ├── calendar/        # Google Calendar integration
│       │   ├── aoo-strategy/    # Ark of Osiris planner
│       │   ├── guide/           # Event & alliance guides
│       │   ├── sunset-canyon/   # Canyon simulator
│       │   ├── upgrade-calculator/  # Building calculator
│       │   └── beta-tools/      # Experimental features
│       ├── components/          # React components
│       │   ├── AppSidebar.tsx   # Global sidebar navigation
│       │   └── aoo-strategy/    # Map, polls, roster components
│       ├── lib/
│       │   ├── supabase/        # Supabase client, fetchAllRows, roster snapshots
│       │   └── guide/           # Guide data and theme utilities
│       ├── data/                # CSV roster data & import files
│       └── scripts/             # Import/seed/check scripts
├── adapters/
│   ├── discord-js/              # Discord bot (JavaScript) - TBD
│   └── discord-py/              # Discord bot (Python) - TBD
├── packages/
│   ├── sim-engine/              # Battle simulator engine
│   ├── map-optimizer/           # Map placement optimizer (Python)
│   ├── vision/                  # Image/OCR utilities (Python)
│   ├── shared-schema/           # JSON schemas
│   └── shared-data/             # Commander/gear data
└── docs/                        # Documentation (GitHub Pages)
    ├── aoo-strategy/            # AoO planner docs
    ├── sunset-canyon/           # Canyon optimizer docs
    ├── upgrade-calculator/      # Calculator docs
    ├── roster/                  # Roster management docs
    └── events/                  # Events & challenges docs
```

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
# Edit .env.local with your Supabase keys

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Environment Variables

Create `apps/web/.env.local` with:

```env
# Required - Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required for roster scripts (admin operations)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional - Roboflow Vision AI (for screenshot scanning)
NEXT_PUBLIC_ROBOFLOW_API_KEY=your_roboflow_api_key
NEXT_PUBLIC_ROBOFLOW_WORKSPACE=your_workspace
NEXT_PUBLIC_ROBOFLOW_WORKFLOW=your_workflow_id
NEXT_PUBLIC_ROBOFLOW_PROJECT=your_project  # For training data uploads
```

---

## Supabase Schema

The app uses the following Supabase tables:

| Table | Purpose |
|-------|---------|
| `alliance_roster` | Active member data — name, power, kills, t4/t5 kills, honor, role, tier, tags, alternate_names, merged_into |
| `roster_snapshots` | Daily historical snapshots — member_name, snapshot_date, power, kills, t4/t5 kills, honor_points, is_active |
| `roster_daily_totals` | Aggregated daily stats (database view) — member_count, total_power, total_kills, avg_power |
| `event_participation` | Event tracking — member_name, event_type (aoo/mobilization), event_date, team, score |
| `aoo_strategy` | AoO player assignments, map positions, and roster data |
| `training_polls` | Training availability polls with multi-day/time support |
| `poll_responses` | Individual poll responses with voter tracking |

### Key Patterns

- **Name changes**: Members have `alternate_names` (text array) and `merged_into` (FK to another member) for tracking renames and account merges.
- **Pagination**: The `fetchAllRows()` utility in `lib/supabase/client.ts` auto-paginates queries past Supabase's default 1,000-row limit.
- **Snapshot comparison**: Growth tables compare the latest snapshot date against a selected earlier date, computing deltas for power, KP, and honor.

---

## JSON Import Formats

The scanners page supports JSON imports for commanders and bag inventory as an alternative to OCR scanning.

### Commander JSON Format

```json
{
  "commanders": [
    {
      "id": "richard-i",
      "name": "Richard I",
      "rarity": "legendary",
      "types": ["infantry", "defender"],
      "level": 60,
      "skills": [5, 5, 5, 5, 4],
      "stars": 5,
      "power": 1234567
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Commander name |
| `rarity` | string | Yes | One of: `legendary`, `epic`, `elite`, `advanced`, `normal` |
| `types` | string[] | Yes | Array of: `infantry`, `cavalry`, `archer`, `leadership`, `defender`, `attacker`, `support`, `gatherer`, `peacekeeping` |
| `level` | number | Yes | Commander level (1-60) |
| `skills` | number[] | Yes | Array of 4-5 skill levels |
| `stars` | number | No | Star level (1-5) |
| `power` | number | No | Commander power |

### Bag Inventory JSON Format

```json
{
  "bagInventory": {
    "chests": {
      "equipmentMaterialChoice": 51,
      "eliteEquipment": 30,
      "epicEquipment": 120,
      "legendaryEquipment": 1
    },
    "equipment": {
      "epic": [
        { "id": "epic-helmet-1", "slot": "helmet", "type": "infantry", "craftable": false }
      ],
      "uncommon": [
        { "id": "uncommon-boots-1", "slot": "boots", "type": "universal", "craftable": true }
      ]
    },
    "blueprints": {
      "legendary": [{ "name": "Legendary Weapon Blueprint", "quantity": 1 }],
      "epic": [{ "name": "Epic Sword Blueprint", "quantity": 1 }],
      "rare": [{ "name": "Rare Horn Blueprint", "quantity": 8 }],
      "normal": [{ "name": "Normal Leather Blueprint", "quantity": 7 }],
      "fragmentedBlueprints": [{ "name": "Fragmented Helmet Blueprint", "quantity": 15 }]
    },
    "materials": {
      "tier4": { "leather": 447, "stone": 452, "hardwood": 437, "bone": 421 },
      "tier3": { "leather": 60, "stone": 51, "hardwood": 47, "bone": 52 },
      "tier2": { "leather": 29, "stone": 28, "hardwood": 44, "bone": 11 },
      "tier1": { "leather": 19, "stone": 21, "hardwood": 17, "bone": 5 },
      "special": { "fireCrystal": 1, "rockChunks": 1 }
    }
  },
  "metadata": {
    "lastUpdated": "2025-12-23",
    "playerPower": 15750303,
    "vipLevel": 9
  }
}
```

| Section | Description |
|---------|-------------|
| `chests` | Equipment chest counts by type |
| `equipment` | Equipment items grouped by rarity, with slot/type/craftable |
| `blueprints` | Blueprint items grouped by rarity, with name and quantity |
| `materials` | Crafting materials grouped by tier (tier1-4 and special) |
| `metadata` | Optional info: lastUpdated, playerPower, vipLevel |

---

## Data Sources

- **Building data**: [Rise of Kingdoms Fandom Wiki](https://riseofkingdoms.fandom.com/wiki/Buildings)
- **Commander stats**: Community-sourced with in-game verification
- **Event mechanics**: In-game observations and community guides

---

## Contributing

This is primarily an internal tool for Angmar Nazgul Guards, but PRs are welcome for:
- Bug fixes
- Data corrections (building requirements, commander stats, event info)
- New features that benefit RoK alliances
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
| [Algorithm Details](https://avweigel.github.io/rok-suite/#/sunset-canyon/algorithm) | How optimization works |
| [Commander Pairings](https://avweigel.github.io/rok-suite/#/sunset-canyon/pairings) | Meta pairings and tier list |

---

## License

MIT

---

*Built with help from Claude Code*
