# RoK Suite Documentation

Welcome to the Rise of Kingdoms Strategy Suite documentation.

## Tools

### [Alliance Roster](roster/README.md)

Track your alliance members' growth over time with daily snapshots and visual analytics.

- [Snapshots & Growth](roster/README.md#snapshots) - Daily data collection and comparison
- [Growth Tables](roster/README.md#growth-tables) - KP, Power, and Honor growth with bar graphs
- [Member Management](roster/README.md#member-management) - Bulk operations, merges, and name changes

### [Alliance Events](events/README.md)

Run alliance-wide challenges and track participation with leaderboards.

- [KP Push Challenge](events/README.md#kp-push-challenge) - Kill point growth competition
- [Leaderboards](events/README.md#leaderboards) - Rankings with bar graphs and ratio tracking

### [Ark of Osiris Planner](aoo-strategy/README.md)

Coordinate your alliance's 30v30 battles with interactive maps and role assignments.

- [Battle Phases](aoo-strategy/phases.md) - Rush, Secure, Ark, Hold phase strategies
- [Team Roles](aoo-strategy/roles.md) - Rally leader, teleporter, garrison responsibilities
- [Map Guide](aoo-strategy/map.md) - Building positions, zone control, corner swap
- [Training Polls](aoo-strategy/training-polls.md) - Schedule training with availability polls
- [Editor Guide](aoo-strategy/editor.md) - Customize strategies for your alliance

### [Sunset Canyon Optimizer](sunset-canyon/README.md)

Build optimal 5v5 defensive formations with our research-backed algorithm.

- [Optimization Algorithm](sunset-canyon/algorithm.md) - Power calculations, pairing scores, positioning logic
- [Commander Pairings](sunset-canyon/pairings.md) - Meta pairings, tier lists, synergy explanations
- [Formation Strategy](sunset-canyon/formations.md) - Positioning tactics, troop types, defensive tips

### [Upgrade Calculator](upgrade-calculator/README.md)

Plan your City Hall progression with an interactive dependency graph.

- [Dependency System](upgrade-calculator/dependencies.md) - How building prerequisites work
- [Buildings Reference](upgrade-calculator/buildings.md) - All 20 buildings detailed
- [Resource Planning](upgrade-calculator/resources.md) - Efficient upgrade strategies
- [Graph Navigation](upgrade-calculator/graph.md) - Using the interactive visualization

### [Scanners](scanners/README.md)

Screenshot analysis tools to build your in-game inventory.

- [Commander Scanner](scanners/commander.md) - Extract commander stats from screenshots
- [Equipment Scanner](scanners/equipment.md) - Build your gear inventory
- [Bag Scanner](scanners/bag.md) - Inventory resources, speedups, and items

### [Game Guides](guide/README.md)

Comprehensive strategy guides for events, alliance coordination, and commander progression.

- [Event Guides](guide/events.md) - Solo, alliance, co-op PvE, and PvP events
- [Alliance Protocols](guide/alliance.md) - Guardian runs, rallies, territory management
- [Commander Strategy](guide/commanders.md) - Progression paths for F2P and P2P

## Quick Links

| | |
|---|---|
| **[Live App](https://rok-suite-web.vercel.app)** | Start using the tools |
| **[GitHub](https://github.com/avweigel/rok-suite)** | Source code |
| **[Sources](sources.md)** | Research credits |

## About

RoK Suite is a toolkit for Rise of Kingdoms strategy planning, built for the **Angmar Nazgul Guards** alliance. The app is backed by **Supabase** (PostgreSQL) for persistent data storage, real-time sync, and authentication.

### Recent Updates

- **Alliance Roster** - Full member tracking with daily snapshots, growth tables (KP/Power/Honor), and name change handling
- **Alliance Events** - KP Push Challenge with leaderboards, podium, bar graphs, ratio tracking, and expandable snapshot history
- **Alliance Calendar** - Google Calendar integration with multi-timezone support and iCal subscriptions
- **Visual Overhaul** - Bar graphs, sparkline charts, and distribution charts across roster and event pages
- **Supabase Schema** - Added `alliance_roster`, `roster_snapshots`, `roster_daily_totals`, and `event_participation` tables
- **Scanners Hub** - Screenshot analysis tools for commanders, equipment, and bag items
- **Training Polls** - Schedule AoO training with drag-to-select availability polls
- **Game Guides** - Comprehensive event and alliance documentation

### Data Sources

The optimization algorithms and meta data are sourced from community guides including:
- [AllClash](https://www.allclash.com/)
- [ROK.guide](https://www.rok.guide/)
- [RiseOfKingdomsGuides.com](https://riseofkingdomsguides.com/)
- [Rise of Kingdoms Fandom Wiki](https://riseofkingdoms.fandom.com/)

---

*Last updated: January 2026*
