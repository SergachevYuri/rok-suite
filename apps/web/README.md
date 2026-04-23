# ROK Suite Web App

Next.js app for **Rise of Kingdoms** alliance and kingdom management — KvK war room, DKP scoring, emigration tracking, mail composer, event planning.

**Live Site:** [rok-suite-web.vercel.app](https://rok-suite-web.vercel.app)

For the overall repo layout, features, and setup story, see the [root README](../../README.md). This file covers the Next.js app specifically.

---

## Tools (Sidebar)

| Page | Purpose |
|------|---------|
| `/calendar` | Google Calendar embed (alliance / kingdom / RoK events) with multi-timezone support |
| `/alliance-calculator` | Flag cost + build-time calculator (Architecture I/II, Artisan's Spirit) |
| `/rok-mail` | WYSIWYG composer for in-game mail markup + Gemini AI assistant |
| `/dkp` | Normalized kingdom-contribution scoring |
| `/migration` | Emigration case tracking (flagged → contacted → terminal state) |
| `/aoo-strategy` | 30v30 AoO planner with training polls |
| `/mge` | Mightiest Governor Event bracket tracking |
| `/kingdom/kingdom-stats` | Daily kingdom-wide rankings and trends |
| `/kvk-map` | Leaflet KvK war room with assignments + achievement progress |

Legacy/archived pages (`/roster`, `/rosters`, `/events`, `/recognition`, `/sunset-canyon`, `/upgrade-calculator`, `/scanners`, `/guide`, `/kingdom/migration-tracker`, `/kingdom/alliance-sorter`, `/kingdom/wanted`, `/beta-tools`) still exist but are not in the sidebar or home. See the root README for the full list.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **UI:** Tailwind CSS 4, Lucide React icons
- **Charts:** Recharts
- **Maps:** Leaflet with custom CRS for image overlays
- **i18n:** next-intl (15 locales)
- **Database:** Supabase (PostgreSQL + realtime subscriptions)
- **AI:** Google Gemini (RoK Mail), Anthropic Claude (optional — KvK RSS node detection)
- **OCR / Vision:** Tesseract.js, Roboflow (legacy scanner pages)
- **State:** Zustand + localStorage
- **Hosting:** Vercel

---

## Auth Model

Client-side role gating using four passwords (no real auth). Roles in ascending privilege:

```
viewer (no password) < power < officer < admin
```

Passwords come from `NEXT_PUBLIC_*_PASSWORD` env vars in [.env.local.example](.env.local.example) — they're shipped in the client bundle and are not a real security boundary. Supabase tables mostly use "allow public" RLS policies so the app can read/write with the anon key; the passwords are the primary write gate, with RLS tightened only where [migrations/tighten-rls-policies.sql](lib/supabase/migrations/tighten-rls-policies.sql) removed write policies. For server-side AI proxies, the Anthropic endpoint additionally checks an `x-rok-auth` header against the officer/admin password. See `lib/auth-passwords.ts` and `lib/kvk-map/war-room-auth.tsx`.

Which page uses which gate:

| Page | Viewer | Officer | Admin |
|------|--------|---------|-------|
| Calendar | Public + 3 shared calendars | — | Leadership calendar unlock |
| Alliance Calculator | Full access | — | — |
| RoK Mail | Full access (incl. AI) | — | — |
| DKP | Read rankings | Upload data, flag players | Edit weights |
| Emigration | Read cases | Claim, contact, request exception | Create cycles, approve/deny exceptions |
| AoO Planner | View strategy | Edit assignments, create polls | — |
| MGE | View events | Assign members | Create/delete events |
| Kingdom Stats | Full access | — | — |
| KvK War Room | View map + progress | Edit assignments, strategy notes | Draw zones, switch seasons |

---

## Development

### Prerequisites
- Node.js 20+
- pnpm 9+
- A Supabase project (free tier works)

### Setup

```bash
# From repo root
pnpm install

# Create environment file
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local with your Supabase keys and passwords
```

Then apply the Supabase schemas — see [Supabase Setup](../../README.md#supabase-setup) in the root README.

### Run locally

```bash
pnpm --filter @rok-suite/web dev
# or: cd apps/web && pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Run production server
pnpm lint         # Run ESLint
pnpm typecheck    # TypeScript check
```

Data-admin scripts live in [scripts/](scripts/) (require `SUPABASE_SERVICE_ROLE_KEY`).

---

## Deployment

Auto-deploys to Vercel on push to `main`. Environment variables are set in the Vercel project settings — mirror the ones in `.env.local.example`.

---

## License

MIT
