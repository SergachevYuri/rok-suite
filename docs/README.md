# RoK Suite Documentation

Welcome to the Rise of Kingdoms Strategy Suite documentation. Built for **Kingdom 23 — Angmar Nazgul Guards**.

## Current Tools

### [Calendar](calendar/README.md)
Google Calendar embed for alliance, kingdom, and global RoK events, with multi-timezone support and iCal subscription URLs.

### [Alliance Calculator](alliance-calculator/README.md)
Flag cost calculator (with Architecture I/II discounts and Artisan's Spirit build-time scaling) and storehouse resource projections.

### [RoK Mail](rok-mail/README.md)
WYSIWYG composer for the game's rich-text mail markup, with templates, a Gemini-powered AI assistant, color/gradient/symbol pickers, and shareable draft links.

### [DKP Score](dkp/README.md)
Normalized kingdom-contribution scoring that blends DKP, deaths, resources gathered, helps, and honor. Backed by Supabase with configurable weights.

### [Emigration](emigration/README.md)
Case-tracking workflow for players flagged on DKP — claim → contact → emigrate / zero / AFK — with a two-step officer-request / admin-decide exception flow.

### [AoO Planner](aoo-strategy/README.md)
Coordinate 30v30 Ark of Osiris battles with an interactive map, zone assignments, and training polls.

- [Battle Phases](aoo-strategy/phases.md)
- [Team Roles](aoo-strategy/roles.md)
- [Map Guide](aoo-strategy/map.md)
- [Training Polls](aoo-strategy/training-polls.md)
- [Editor Guide](aoo-strategy/editor.md)

### [MGE](mge/README.md)
Plan and track Mightiest Governor Event rankings with officer-managed brackets.

### [Kingdom Stats](kingdom-stats/README.md)
Daily kingdom-wide rankings, power trends, and alliance breakdowns built from uploaded scans.

### [KvK War Room](kvk-map/README.md)
Interactive Leaflet map for KvK zone planning, alliance feature assignments, live achievement progress (Crusader + KvK2), and officer-gated strategy notes.

---

## Legacy / Archived

These pages still work in the app but are no longer featured on the home screen or sidebar. Documentation is preserved here for reference; the code may be removed in a future release.

- [Alliance Roster](roster/README.md) — replaced by the DKP + Emigration flow
- [Alliance Events](events/README.md) — KP Push Challenge leaderboards
- [Sunset Canyon](sunset-canyon/README.md) — formation optimizer
  - [Optimization Algorithm](sunset-canyon/algorithm.md)
  - [Commander Pairings](sunset-canyon/pairings.md)
  - [Formation Strategy](sunset-canyon/formations.md)
- [Upgrade Calculator](upgrade-calculator/README.md) — City Hall dependency graph
  - [Dependency System](upgrade-calculator/dependencies.md)
  - [Buildings Reference](upgrade-calculator/buildings.md)
  - [Resource Planning](upgrade-calculator/resources.md)
  - [Graph Navigation](upgrade-calculator/graph.md)
- [Scanners](scanners/README.md) — OCR/Vision screenshot scanners
  - [Commander Scanner](scanners/commander.md)
  - [Equipment Scanner](scanners/equipment.md)
  - [Bag Scanner](scanners/bag.md)
- [Game Guides](guide/README.md) — static event and commander guides
  - [Event Guides](guide/events.md)
  - [Alliance Protocols](guide/alliance.md)
  - [Commander Strategy](guide/commanders.md)

---

## Who can use what on the live site

The live app is configured for **Angmar Nazgul Guards** (Kingdom 23). If you don't have an Angmar password, you still get a useful read-only experience; officer/admin features will not accept an arbitrary password.

| Tool | Viewer (public) | Officer | Admin |
|------|-----------------|---------|-------|
| Calendar | Public + 3 shared calendars | — | Leadership calendar |
| Alliance Calculator | Full | — | — |
| RoK Mail | Full (incl. AI) | — | — |
| DKP | Read rankings | Upload + flag | Edit weights |
| Emigration | Read cases | Claim, contact, request exception | Create cycles, approve/deny |
| AoO Planner | View strategy | Edit assignments, polls | — |
| MGE | View events | Assign members | Create/delete |
| Kingdom Stats | Full | — | — |
| KvK War Room | View map + progress | Edit assignments, notes | Draw zones, switch seasons |

To use officer/admin features for your own alliance, clone the repo and run it against your own Supabase instance — see the [root README](https://github.com/avweigel/rok-suite#getting-started).

---

## Quick Links

| | |
|---|---|
| **[Live App](https://rok-suite-web.vercel.app)** | Start using the tools |
| **[GitHub](https://github.com/avweigel/rok-suite)** | Source code |
| **[Sources](sources.md)** | Research credits |

## About

RoK Suite is a toolkit for Rise of Kingdoms strategy planning. The app is backed by **Supabase** (PostgreSQL) for persistent data storage, real-time sync, and role-based access. The docs site is built with **docsify** and deployed to GitHub Pages.

### Data Sources

The optimization algorithms and meta data are sourced from community guides including:
- [AllClash](https://www.allclash.com/)
- [ROK.guide](https://www.rok.guide/)
- [RiseOfKingdomsGuides.com](https://riseofkingdomsguides.com/)
- [Rise of Kingdoms Fandom Wiki](https://riseofkingdoms.fandom.com/)

---

*Last updated: April 2026*
