# MGE

Plan and track **Mightiest Governor Event** cycles — the weekly kingdom event that scores governors on tiered objectives (gathering, killing, building, etc.).

**Live:** [/mge](https://rok-suite-web.vercel.app/mge)

## What it does

- **Event cards** — each MGE cycle renders as a card with its tiers, assigned members, and status
- **Tiered assignments** — officers slot roster members into tier brackets for each day of the event
- **Roster-backed member picker** — pulls active members from the alliance roster and filters by alliance tag
- **Tier sorting** — members are ordered by the in-game tier ladder (see `lib/mge/helpers.ts` → `tierSortValue`)
- **Kingdom header markup** — exportable headers use the same red/gold color scheme as in-game mails

## Typical flow

1. **Admin** creates a new MGE event (dates, tiers, categories)
2. **Officers** open the event and assign members into each tier/day bracket
3. During the event, officers update placements and spot check assignments
4. After the event, the card serves as a historical record

## Data

Events and assignments are stored in Supabase (`mge_events` + related tables via `lib/supabase/use-mge`). Officer actions require the officer password; creating/deleting events requires admin.
