# Kingdom Stats

Daily kingdom-wide rankings and trend charts built from the stats files uploaded to [DKP Score](../dkp/README.md) and other scan sources.

**Live:** [/kingdom/kingdom-stats](https://rok-suite-web.vercel.app/kingdom/kingdom-stats)

## What's in it

- **Top-N leaderboards** across power, kills (T4+T5), honor, and DKP
- **Historical trends** — line charts comparing snapshot dates
- **Alliance breakdowns** — slice any ranking by alliance tag
- **Individual lookup** — pick a player to see their trajectory across all metrics

## Data source

The page reads from the `alliance_roster`, `roster_snapshots`, and related Supabase tables that get populated whenever officers upload a stats export through DKP Score or the roster importers. No separate upload flow lives on this page — it's a read-only lens over the shared dataset.

## Typical flow

1. Open the page to see the current top-N leaderboards
2. Switch metric (power / kills / honor / DKP) with the tab selector
3. Filter by alliance tag to compare alliances
4. Click a player to drill into their personal history
