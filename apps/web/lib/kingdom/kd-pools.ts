// KD pool definitions — used to split the Kingdom Stats page into two views
// while the next-matchmaking pool is still uncertain.
//
//   - "current"  → 3897–3928 (32 KDs we've been tracking for KvK3)
//   - "preview"  → 3929–3944 (16 KDs we started scanning as caution in case
//                  the next matchmaking widens to 48). Kept on a separate page
//                  so the existing Table/Charts/Comparison/Migrations views
//                  don't get polluted (every player in the new pool would
//                  otherwise show up as a "new joiner" on the Migrations tab).
//
// The candidate page intentionally ignores pools — anyone in either range is
// a possible recruit, so it pulls from the full union (3897–3944).

export type KdPoolKey = 'current' | 'preview';

export interface KdPool {
  key: KdPoolKey;
  label: string;
  /** Inclusive lower bound on kingdom_id. */
  min: number;
  /** Inclusive upper bound on kingdom_id. */
  max: number;
  /** Tabs to expose for this pool. `null` = all tabs allowed. */
  allowedTabs: ReadonlySet<string> | null;
}

export const KD_POOLS: Record<KdPoolKey, KdPool> = {
  current: {
    key: 'current',
    label: 'KvK3 current pool',
    min: 3897,
    max: 3928,
    allowedTabs: null,
  },
  preview: {
    key: 'preview',
    label: 'Preview pool (next KvK)',
    min: 3929,
    max: 3944,
    allowedTabs: new Set(['table', 'comparison']),
  },
};

/** True when `kingdomId` falls inside the pool's KD range. */
export function isInPool(kingdomId: number, pool: KdPool): boolean {
  return kingdomId >= pool.min && kingdomId <= pool.max;
}

/** Builder for an array filter — keeps just the KDs that fit the pool. */
export function poolFilter(pool: KdPool): (kd: number) => boolean {
  return (kd) => isInPool(kd, pool);
}

// ─── KvK history (preview pool — 3929-3944) ─────────────────────────────
// Each KD's outcome in its last KvK. Used to highlight rows in the preview
// pool's Comparison tab so it's immediately obvious which brackets are
// "experienced winners" vs "expected to scramble".

export type KvkBracket = 'A' | 'B';
export type KvkResult = 'won' | 'lost';
export interface KvkOutcome {
  bracket: KvkBracket;
  result: KvkResult;
}

export const KVK_HISTORY: Record<number, KvkOutcome> = {
  // KvK A winners
  3929: { bracket: 'A', result: 'won' },
  3933: { bracket: 'A', result: 'won' },
  3936: { bracket: 'A', result: 'won' },
  3931: { bracket: 'A', result: 'won' },
  // KvK A losers
  3937: { bracket: 'A', result: 'lost' },
  3935: { bracket: 'A', result: 'lost' },
  3944: { bracket: 'A', result: 'lost' },
  3942: { bracket: 'A', result: 'lost' },
  // KvK B winners
  3930: { bracket: 'B', result: 'won' },
  3939: { bracket: 'B', result: 'won' },
  3938: { bracket: 'B', result: 'won' },
  3943: { bracket: 'B', result: 'won' },
  // KvK B losers
  3932: { bracket: 'B', result: 'lost' },
  3941: { bracket: 'B', result: 'lost' },
  3940: { bracket: 'B', result: 'lost' },
  3934: { bracket: 'B', result: 'lost' },
};

export function kvkOutcomeFor(kingdomId: number): KvkOutcome | null {
  return KVK_HISTORY[kingdomId] ?? null;
}
