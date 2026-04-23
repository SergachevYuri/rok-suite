# Rise of Kingdoms Strategy Suite

A toolkit for **Rise of Kingdoms** kingdom and alliance management — KvK war room, DKP scoring, emigration tracking, mail composer, event planning, and more. Built for **Kingdom 23 — Angmar Nazgul Guards**.

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

### Calendar (`/calendar`)
- **Google Calendar embed** for alliance, kingdom, and global RoK events
- **Multi-timezone support** — UTC (game time), US/UK/EU/Asia-Pacific/Australia zones
- **Separate leadership calendar** gated behind admin password
- **iCal subscription URLs** for Apple Calendar, Outlook, and other apps

### Alliance Calculator (`/alliance-calculator`)
- **Flag cost calculator** for LK crusader flags with exact base + discounted resource costs
- **Architecture I/II tech discounts** and **Artisan's Spirit** build-time scaling
- **Storehouse projections** — estimate how much RSS your alliance can protect

### RoK Mail (`/rok-mail`)
- **WYSIWYG mail composer** for RoK's in-game rich-text markup (bold, italic, color, size, gradient, symbols)
- **Templates** for alliance announcements, recruitment, and event mails
- **Gemini-powered AI assistant** to draft or polish mail content
- **Share links** — persist a draft to Supabase and share a short URL
- **Auto-split** for mails that exceed the in-game character cap

### DKP Score (`/dkp`)
- **Normalized kingdom-contribution score** combining DKP, deaths, resources gathered, helps, and honor
- **Stats-file ingestion** — upload the game export and automatically merge against the existing roster
- **Configurable weights** stored in Supabase and shared across officers
- **Flagging workflow** — mark low-contribution players for emigration follow-up

### Emigration (`/migration`)
- **Two-step exception workflow** — officers request exceptions, admins decide
- **Case tracking** through claim → contact → emigrate / zero / AFK terminal states
- **Cycle-based** — start a new cycle each season, close it when done
- **Real-time sync** across officers via Supabase subscriptions

### AoO Planner (`/aoo-strategy`)
- **30v30 team assignments** with 3-zone Blue/Orange/Purple system
- **Interactive battle map** with 18 buildings and phase-based attack planning
- **Corner swap** toggle to mirror strategy for different spawn positions
- **Training availability polls** with drag-to-select UI and timezone conversion
- **Copyable strategy guides** with per-zone exports for Discord/game chat

### MGE (`/mge`)
- **Mightiest Governor Event tracking** with officer-managed brackets
- **Tier-based ranking** across all MGE categories
- **Roster-backed** member picker for assignments

### Kingdom Stats (`/kingdom/kingdom-stats`)
- **Daily kingdom-wide rankings** across power, kills, and honor
- **Historical trend charts** built from uploaded scans
- **Alliance breakdowns** for comparing alliance-level contribution

### KvK War Room (`/kvk-map`)
- **Interactive Leaflet strategy map** for KvK zone planning
- **Feature assignment** — assign zones, passes, altars, and objectives to alliances
- **Achievement progress tracking** — live computation of Crusader/KvK2 achievement progress per alliance and kingdom-wide
- **Strategy notes** — per-feature text with officer/admin role gating
- **Zone polygon drawing** — admin tool to define custom map zones
- **Multi-season support** — Crusader and KvK Season 2 achievement datasets

---

## Legacy / Archived Tools

These pages still exist in the codebase but are no longer featured in the sidebar. They may be removed in a future release.

| Page | Status | Notes |
|------|--------|-------|
| `/roster`, `/rosters` | Archived | Centralized roster replaced by `/dkp` + `/migration` flow |
| `/events` | Archived | Alliance event leaderboards (KP Push Challenge) |
| `/recognition` | Archived | Recognition board |
| `/sunset-canyon` | Archived | Sunset Canyon formation optimizer |
| `/upgrade-calculator` | Archived | City Hall dependency graph |
| `/scanners` | Archived | OCR/Vision scanners (commander, equipment, bag) |
| `/guide` | Archived | Static event and commander guides |
| `/kingdom/migration-tracker` | Archived | Replaced by `/migration` |
| `/kingdom/alliance-sorter` | Archived | Auto-assign players to alliances |
| `/kingdom/wanted` | Archived | Wanted-list tracking |
| `/beta-tools` | Hidden | Experimental tools staging area |

---

## Access Model

Client-side role gating (no real auth) using four passwords in `.env.local`. Roles in ascending privilege:

```
viewer (no password) < power < officer < admin
```

| Tool | Viewer | Officer | Admin |
|------|--------|---------|-------|
| Calendar | Public + 3 shared calendars | — | Leadership calendar |
| Alliance Calculator | Full | — | — |
| RoK Mail | Full (incl. AI) | — | — |
| DKP | Read rankings | Upload + flag | Edit weights |
| Emigration | Read cases | Claim, contact, request exception | Create cycles, approve/deny |
| AoO Planner | View strategy | Edit assignments, polls | — |
| MGE | View events | Assign members | Create/delete |
| Kingdom Stats | Full | — | — |
| KvK War Room | View map + progress | Edit assignments, notes | Draw zones, switch seasons |

Passwords are **client-side** — a determined attacker could extract them from the `NEXT_PUBLIC_*` bundle. In practice the Supabase instance uses broad "allow public" row-level security policies for most tables so the app can read/write freely with the anon key. Writes are gated primarily by the passwords, with RLS as a partial second layer (see [migrations/tighten-rls-policies.sql](apps/web/lib/supabase/migrations/tighten-rls-policies.sql) for what's locked down). To use officer/admin features for your own alliance, run your own instance — the live Angmar site won't accept passwords you don't have.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| i18n | next-intl (15 locales) |
| Database | Supabase (PostgreSQL with real-time subscriptions) |
| Maps | Leaflet with custom CRS for image overlays |
| Charts | Recharts |
| AI | Google Gemini (RoK Mail drafting) |
| OCR / Vision | Tesseract.js, Roboflow (legacy scanner pages) |
| State | Zustand + localStorage persistence |
| Deployment | Vercel (app), GitHub Pages (docs) |

---

## Getting Started

### Prerequisites

- **Node.js 20+** and **pnpm 9+**
- A **Supabase** project (free tier works — [supabase.com](https://supabase.com))
- Optional: a **Google Gemini** API key (for RoK Mail drafting) and an **Anthropic** API key (for KvK RSS node detection)

### Install and run

```bash
# Clone the repo
git clone https://github.com/avweigel/rok-suite.git
cd rok-suite

# Install dependencies
pnpm install

# Set up environment variables
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local — see the Environment Variables section below

# Apply the Supabase schema (see Supabase Setup below)

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Makefile shortcuts

The repo root has a small [Makefile](Makefile) with `make install`, `make build`, `make lint`, `make test`, and `make format` wrappers around the `pnpm -r` equivalents.

---

## Environment Variables

Create `apps/web/.env.local` from [apps/web/.env.local.example](apps/web/.env.local.example):

```env
# Required — Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required — Auth passwords (client-side role gating: viewer < power < officer < admin)
NEXT_PUBLIC_ADMIN_PASSWORD=your_admin_password
NEXT_PUBLIC_OFFICER_PASSWORD=your_officer_password
NEXT_PUBLIC_POWER_PASSWORD=your_power_user_password

# Optional — Google Gemini AI (RoK Mail drafting)
GEMINI_API_KEY=your_gemini_api_key

# Optional — Anthropic Claude (KvK map RSS node detection)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional — Roboflow Vision AI (legacy scanner pages)
NEXT_PUBLIC_ROBOFLOW_API_KEY=your_roboflow_api_key
NEXT_PUBLIC_ROBOFLOW_WORKSPACE=your_workspace
NEXT_PUBLIC_ROBOFLOW_WORKFLOW=your_workflow_id
NEXT_PUBLIC_ROBOFLOW_PROJECT=your_project
```

The passwords are **not** a security boundary — they gate UI only. Authoritative rules are enforced by Supabase row-level security.

---

## Supabase Setup

There's no migration runner. Schemas live in two folders that you apply manually in the Supabase SQL Editor:

1. **Base schemas** in [apps/web/lib/supabase/](apps/web/lib/supabase/) — create the tables.
2. **Incremental migrations** in [apps/web/lib/supabase/migrations/](apps/web/lib/supabase/migrations/) — column additions, RLS tightening, KvK tables, etc.

### Required for current tools

| File | Creates |
|------|---------|
| `schema-alliance-roster.sql` | `alliance_roster` (used by DKP, Kingdom Stats, MGE) |
| `schema-dkp.sql` | `dkp_datasets` |
| `schema-migration-cases.sql` | `migration_cycles`, `migration_cases` (Emigration) |
| `schema-rok-mail.sql` | `rok_mail` (shareable drafts) |
| `schema-mge.sql` | `mge_events` and related tables |
| `schema-aoo-polls.sql` | `training_polls`, `training_poll_votes` |
| `schema-aoo-team.sql`, `schema-aoo-event-mode.sql`, `schema-aoo-share.sql` | `aoo_strategy` columns (run in this order) |
| `migrations/kvk-map-tables.sql` | `kvk_maps`, `kvk_features`, `kvk_assignments`, etc. |
| `migrations/add-kvk-stage.sql`, `add-kvk-allocation-targets.sql`, `add-kvk-strategies.sql` | KvK extensions |

### Optional (only needed for legacy pages)

| File | For page |
|------|----------|
| `schema.sql` + `add-kvk-commanders.sql` + `add-missing-commanders.sql` + `add-sarka.sql` | Sunset Canyon |
| `schema-roster-snapshots.sql` | Alliance Roster (snapshots / growth tables) |
| `schema-event-participation.sql` | Alliance Events (KP Push Challenge) |
| `schema-guide.sql` | Game Guides |
| `migrations/add-kingdom-scans.sql`, `create-wanted-status.sql`, `add-sorter-versions.sql`, `add-pre-migration-governors.sql` | Kingdom legacy pages |

Apply files in the order listed. Run each in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new) or via `psql`/`supabase db push`. Setup is **best-effort** — you may need to cherry-pick migrations for RLS policies if you hit permission errors at runtime.

---

## Data Privacy

Roster data, kingdom scans, and player statistics are stored in your own Supabase instance and are **not** committed to the repository. The `apps/web/data/` directory is gitignored for CSV, SQL, XLSX, and other data files. Only static game data (achievement definitions, equipment lists) is tracked in version control.

---

## Repository Structure

```
rok-suite/
├── apps/
│   └── web/                     # Next.js web application
│       ├── app/                 # App router pages
│       │   ├── calendar/            # Google Calendar embed
│       │   ├── alliance-calculator/ # Flag cost + storehouse projections
│       │   ├── rok-mail/            # In-game mail composer
│       │   ├── dkp/                 # Kingdom contribution scoring
│       │   ├── migration/           # Emigration case tracker
│       │   ├── aoo-strategy/        # Ark of Osiris planner
│       │   ├── mge/                 # MGE event tracking
│       │   ├── kingdom/             # Kingdom stats + legacy tools
│       │   ├── kvk-map/             # KvK war room
│       │   └── …                    # legacy pages (see table above)
│       ├── components/          # React components
│       ├── lib/                 # Shared utilities (supabase, kvk-map, kingdom, …)
│       ├── messages/            # i18n message catalogs (15 locales)
│       └── data/                # Static game data (player data is gitignored)
├── apps/
│   └── api/                     # HTTP API (stub — not yet implemented)
├── adapters/
│   ├── discord-js/              # Discord bot (stub — not yet implemented)
│   └── discord-py/              # Python Discord bot (README only)
├── packages/
│   ├── sim-engine/              # Battle simulator engine
│   ├── map-optimizer/           # Map placement optimizer (Python)
│   ├── vision/                  # Image/OCR utilities (Python)
│   ├── shared-schema/           # JSON schemas
│   └── shared-data/             # Commander/gear data
└── docs/                        # Documentation (GitHub Pages, docsify)
```

### Planned / stub packages

`apps/api`, `adapters/discord-js`, and `adapters/discord-py` are scaffolded for future work — they have `.env.example` files and `package.json` entries but no real implementation yet. Safe to ignore when running the web app.

---

## Contributing

PRs are welcome for:
- Bug fixes
- Data corrections (flag costs, achievement definitions, etc.)
- New features that benefit RoK alliances and kingdoms
- Documentation improvements

---

## Documentation

Full documentation is available at **[avweigel.github.io/rok-suite](https://avweigel.github.io/rok-suite/)**

| Guide | Description |
|-------|-------------|
| [Quick Start](https://avweigel.github.io/rok-suite/#/quickstart) | Get started with the tools |
| [KvK War Room](https://avweigel.github.io/rok-suite/#/kvk-map/README) | Interactive KvK map and achievement tracking |
| [DKP Score](https://avweigel.github.io/rok-suite/#/dkp/README) | Kingdom contribution scoring |
| [Emigration](https://avweigel.github.io/rok-suite/#/emigration/README) | Case tracking workflow |
| [RoK Mail](https://avweigel.github.io/rok-suite/#/rok-mail/README) | Mail composer and AI drafting |
| [Alliance Calculator](https://avweigel.github.io/rok-suite/#/alliance-calculator/README) | Flag cost projections |

---

## License

MIT

---

*Built with help from Claude Code*
