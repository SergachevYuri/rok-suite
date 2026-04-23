# KvK War Room

The central planning surface for KvK seasons. An interactive Leaflet-based map where admins define zones and features, officers assign alliances to them, and the app computes live achievement progress across the kingdom.

**Live:** [/kvk-map](https://rok-suite-web.vercel.app/kvk-map)

## Features

### Interactive map
- Leaflet with a custom CRS for overlaying the KvK map image
- Pan, zoom, and click through layered polygon overlays
- Admins can draw new zone polygons directly on the map

### Feature assignments
- Each **feature** (zone, pass, altar, sanctum, objective) can be **assigned** to one or more alliances
- Assignments display as colored overlays tied to the alliance's color
- Officers can edit assignments live; admins can lock them

### Achievement progress
The app computes per-alliance and kingdom-wide progress for the supported achievement datasets:

| Dataset | Season |
|---------|--------|
| Crusader | KvK 1 (original) |
| KvK 2 | Season of Conquest |

Progress is derived from the alliance assignments plus per-feature achievement metadata (found in `lib/kvk-achievements/`). Completed objectives, in-progress counts, and totals are all shown on the same panel.

### Strategy notes
- Per-feature free-text notes (strategy, timing, objectives)
- Officer and admin write access; everyone else is read-only

### Multi-season support
The map and feature set switch based on the selected season; progress logic re-evaluates against the active dataset.

## Role gating

| Role | Can |
|------|-----|
| Public | View the map, assignments, achievement progress, strategy notes |
| Officer | Edit assignments, write strategy notes |
| Admin | Draw zones, add/remove features, lock assignments, switch seasons |

Passwords are stored client-side (`NEXT_PUBLIC_ADMIN_PASSWORD` / `NEXT_PUBLIC_OFFICER_PASSWORD`) — the gating is UX-level, not a security boundary. Supabase row-level security enforces the authoritative rules.

## Data

- `kvk_maps` — map metadata (image URL, CRS)
- `kvk_features` — features drawn on the map (polygons, points, metadata)
- `kvk_assignments` — which alliances own which features
- `kvk_alliances` — alliance color/tag metadata
- `kvk_strategies` — per-feature strategy notes
