# DKP Score

A normalized kingdom-contribution score that blends DKP, deaths, resources gathered, helps, and honor into a single comparable number. The feeder for the [Emigration](../emigration/README.md) workflow — low-DKP players are flagged here and followed up there.

**Live:** [/dkp](https://rok-suite-web.vercel.app/dkp)

## What goes into the score

Each component is normalized (typically to its percentile across the kingdom) and multiplied by a configurable weight:

| Component | Source | Typical weight |
|-----------|--------|----------------|
| DKP | Stats export `dkp` column | Primary |
| Deaths (T4+T5) | Stats export `deads` column | Secondary |
| Resources gathered | Stats export `gathered` column | Secondary |
| Alliance helps | Stats export `helps` column | Tertiary |
| Honor | Stats export `honor_points` column | Tertiary |

Weights are stored shared in Supabase (`dkp_config`) so officers see the same configuration.

## Data ingestion

Two file types are merged into the dataset:

1. **Stats export** (XLSX/CSV from the game's governor export) — DKP, deaths, RSS, helps, etc.
2. **Honor file** (CSV) — honor point totals, merged on governor ID

The `mergeIntoPlayers` helper uses loose matching (governor ID first, then name) to handle name changes between uploads.

## Typical flow

1. Upload the latest stats export; existing player records update in place
2. Upload the honor file for the same period
3. Review the top and bottom of the ranking; tune weights if needed
4. Flag low-contribution players — this promotes them into the Emigration cycle
5. Check back after the next scan to see score changes

## Officer / admin gating

Uploading and editing weights requires the officer password. Admins additionally control flagging and the underlying config row.
