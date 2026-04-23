# Emigration

Case-tracking workflow for players flagged via [DKP Score](../dkp/README.md). Each cycle groups flagged players, walks them through officer outreach, and terminates in one of a fixed set of outcomes.

**Live:** [/migration](https://rok-suite-web.vercel.app/migration)

## Concepts

### Cycle

A time-boxed batch of cases — typically one per KvK season. Admins create a cycle, bulk-seed it from the DKP flag list, and close it when every case reaches a terminal state.

### Case

One player, one cycle. Moves through these states:

```
PENDING → CLAIMED → CONTACTED → (outcome)
```

Outcomes (terminal):

| State | Meaning |
|-------|---------|
| `MIGRATED` | Player left the kingdom |
| `ZEROED` | Player was zeroed per DKP protocol |
| `AFK` | Player is inactive but staying |
| `EXCEPTION` | Admin-approved exception (stays, not zeroed) |

## Officer flow

1. **Claim** a pending case to take ownership
2. **Contact** the player (in-game mail, Discord, etc.) and mark contacted
3. Mark the outcome:
   - If they agree to migrate → **Mark to Zero** (then confirm zeroed once done)
   - If they're inactive but staying → **Mark AFK**
   - If they should stay for a non-standard reason → **Request Exception**
4. If you claimed the wrong case, **Unclaim** to release it

## Exception workflow (two-step)

Exceptions require admin approval to prevent officer unilateral decisions:

1. Officer opens a case and **Requests Exception** with a reason
2. Admin reviews the request and either **Marks Exception** (approves) or **Denies** (case returns to pending)

## Migrated suggestions

The app periodically checks scan data for flagged players. If a player no longer appears in the kingdom, a **Migrated suggestion** surfaces on the case so officers can confirm with one click.

## Admin actions

- Create / close / delete cycles
- Bulk-create cases from a flag list
- Approve or deny exception requests
- Confirm zeroed cases
- Reset a case back to pending (undo)

## Real-time sync

Cycles and cases subscribe to Supabase realtime channels — officer actions propagate to every open client immediately.
