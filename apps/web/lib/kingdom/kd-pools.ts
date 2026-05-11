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
