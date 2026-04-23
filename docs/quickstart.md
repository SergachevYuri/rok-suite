# Quick Start

Get up and running with RoK Suite in minutes.

## Using the Live App

The easiest way to use RoK Suite is through the live deployment:

**[rok-suite-web.vercel.app](https://rok-suite-web.vercel.app)**

No installation required — just open and start planning. The live site is configured for **Angmar Nazgul Guards**; if you don't have an Angmar password, you still get a read-only experience. To unlock officer/admin features for your own alliance you'll need to run your own copy — see [Running Locally](#running-locally) below.

See the [access table](README.md#who-can-use-what-on-the-live-site) for what viewer / officer / admin can do on each page.

## Tour of the Tools

### Calendar
Navigate to **Calendar** for upcoming alliance, kingdom, and RoK events with multi-timezone support. Use the iCal URL to subscribe from Apple Calendar, Outlook, or Google Calendar.

### Alliance Calculator
Open **Alliance Calculator** to estimate flag costs (with Architecture I/II and Artisan's Spirit discounts) and project alliance storehouse resource coverage.

### RoK Mail
Draft in-game mails in **RoK Mail**. Pick a template, format with the toolbar (bold, color, gradient, symbols), optionally use the Gemini AI assistant, then copy the markup or share a link.

### DKP Score
Upload your kingdom stats export to **DKP Score** to compute normalized kingdom-contribution scores. Officers can tune weights and flag low-contribution players for follow-up in Emigration.

### Emigration
**Emigration** tracks flagged players through claim → contact → emigrate / zero / AFK outcomes. Officers can request exceptions; admins approve or deny.

### AoO Planner
Use **AoO Planner** for 30v30 Ark of Osiris coordination — zone assignments, battle map, phase planning, training polls, and exportable strategy guides.

### MGE
In **MGE**, set up brackets for Mightiest Governor Event cycles and assign roster members across tiers.

### Kingdom Stats
**Kingdom Stats** shows daily kingdom-wide rankings, power trends, and alliance breakdowns from uploaded scans.

### KvK War Room
**KvK War Room** is the Leaflet-based map for zone assignments, achievement progress tracking (Crusader / KvK2), and officer strategy notes.

## Running Locally

Prerequisites: **Node.js 20+**, **pnpm 9+**, a **Supabase** project (free tier works).

```bash
# Clone the repo
git clone https://github.com/avweigel/rok-suite.git
cd rok-suite

# Install dependencies
pnpm install

# Set up environment variables
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local with your Supabase keys and passwords

# Apply the Supabase schema (see the root README's Supabase Setup section)

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Admin role gating (client-side) |
| `NEXT_PUBLIC_OFFICER_PASSWORD` | Officer role gating (client-side) |
| `NEXT_PUBLIC_POWER_PASSWORD` | Power-user role gating (client-side) |
| `GEMINI_API_KEY` | Optional — RoK Mail AI assistant |
| `ANTHROPIC_API_KEY` | Optional — KvK map RSS node detection |

### Supabase

The repo ships raw SQL schemas in [apps/web/lib/supabase/](https://github.com/avweigel/rok-suite/tree/main/apps/web/lib/supabase) and incremental migrations in [apps/web/lib/supabase/migrations/](https://github.com/avweigel/rok-suite/tree/main/apps/web/lib/supabase/migrations). There's no migration runner — apply them manually in the Supabase SQL Editor. See the [root README → Supabase Setup](https://github.com/avweigel/rok-suite#supabase-setup) for the required vs. optional file list.

## Need Help?

- Browse the tool pages in the sidebar for feature-level docs
- Open an issue on [GitHub](https://github.com/avweigel/rok-suite/issues)
