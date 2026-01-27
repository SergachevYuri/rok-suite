# Alliance Events

Run alliance-wide challenges and track participation with leaderboards, bar graphs, and ratio analytics.

## Overview

The Alliance Events hub (`/events`) hosts time-bound challenges that measure member growth across specific metrics. Events compare roster snapshots between a start and end date to calculate gains and rank participants.

## KP Push Challenge

The first event — **KP Push Challenge** (January 2026) — tracks kill point growth across the alliance with a target of achieving a 1:1 Power-to-KP ratio.

### Summary Cards

Four cards at the top of the page:

| Card | Description |
|------|-------------|
| **Total KP Gained** | Sum of all KP gains across participants |
| **Total Power Change** | Sum of all power changes |
| **Top Performer** | Highest KP gainer with their total |
| **Best Ratio Gain** | Member with best Power:KP ratio improvement |

### Top 3 Podium

Highlight cards for the top three KP gainers:
- **Gold** (#1), **Silver** (#2), **Bronze** (#3) accent styling
- Each card shows: name, role badge, KP gained, power change, ratio transition
- Responsive layout: 3 columns on desktop, stacked on mobile

### KP Distribution Chart

A compact bar chart showing the KP gain spread across all participants:
- One bar per member, sorted by KP gain descending
- Red gradient bars with tooltip on hover
- Provides an instant visual feel for gain distribution

### Leaderboards

The main leaderboard for regular members (R1-R3):

| Column | Description |
|--------|-------------|
| **Rank** | Position by KP gained |
| **Name** | Member name with role badge |
| **KP Gained** | Red gradient bar graph + value |
| **Power Change** | Blue/red gradient bar graph + value |
| **Ratio** | Start → End ratio with delta indicator |

**Bar graphs** scale each member's value relative to the maximum in that column, providing instant visual comparison.

**Ratio display** shows the Power:KP ratio transition (e.g., `2.8 → 1.9`) with a delta arrow:
- Green with ↓ arrow = ratio improved (lower is better)
- Red with ↑ arrow = ratio worsened

### Leadership Table

Separate section for R4/R5 members with full feature parity:
- Collapsible section header
- Same bar graphs and ratio display as rankings
- Expandable rows with snapshot history

### Expandable Snapshot History

Click any member row to reveal:

#### Snapshot Table
- Date-by-date breakdown: Power, KP, T4 KP, T5 KP, Honor
- **Carryover dimming**: Values unchanged from previous snapshot appear dimmed (italic, reduced opacity)
- Color-coded values: green (Power), red (KP), yellow (T4), orange (T5)

#### Growth Sparklines
When a member has 2+ snapshots, a 2x2 grid of mini line charts appears:
- **Power** (green), **Kill Points** (red), **T4 KP** (yellow), **T5 KP** (orange)
- Minimalist design: no dots, no axes, 45px height
- Built with Recharts `LineChart` component

## How Data Flows

1. **Fetch available snapshot dates** from `roster_snapshots`
2. **Find closest actual dates** to the configured event start/end dates
3. **Load alliance roster** for role mapping and name variant resolution
4. **Fetch start and end snapshots** (filtered to `is_active = true`)
5. **Calculate per-member results**: KP gain, power change, ratio values
6. **Rank members** by KP gain (only members with positive KP gain are ranked)
7. **Separate leadership** (R4/R5) from regular rankings

### Name Resolution

Events use the same name resolution system as the roster:
- Canonical name mapping via `alternate_names` and `merged_into`
- Normalized tag matching (strips alliance prefixes)
- Ensures members are correctly identified across name changes

## Adding New Events

Events are defined in the `allianceEvents` array on the events listing page. Each event has:
- `slug` — URL path segment
- `name` — Display name
- `startDate` / `endDate` — Event window
- `status` — active, completed, or upcoming
- `description` — Short summary

To create a new event, add an entry to the array and create a corresponding page under `app/events/[slug]/page.tsx`.

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `roster_snapshots` | Source data — member snapshots compared between event dates |
| `alliance_roster` | Member metadata — roles, alternate names for name resolution |
| `event_participation` | Event tracking — member_name, event_type, event_date, team, score |
