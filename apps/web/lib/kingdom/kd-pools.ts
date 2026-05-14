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

export interface KdRange {
  /** Inclusive lower bound on kingdom_id. */
  min: number;
  /** Inclusive upper bound on kingdom_id. */
  max: number;
}

export interface KdPool {
  key: KdPoolKey;
  label: string;
  /** All KDs in the pool — drives the kingdoms dropdown, Table tab, etc.
   *  Supports disjoint ranges so a pool can stitch together separate brackets. */
  ranges: readonly KdRange[];
  /** Optional subset used for the Comparison tab. When omitted, comparison
   *  uses the full `ranges`. Lets us show a wider list of KDs in the Table
   *  view than what we care to rank together. */
  comparisonRanges?: readonly KdRange[];
  /** Tabs to expose for this pool. `null` = all tabs allowed. */
  allowedTabs: ReadonlySet<string> | null;
}

export const KD_POOLS: Record<KdPoolKey, KdPool> = {
  current: {
    key: 'current',
    label: 'KvK3 current pool',
    ranges: [{ min: 3897, max: 3928 }],
    allowedTabs: null,
  },
  preview: {
    key: 'preview',
    // 3865-3896 are older brackets we want to inspect in the Table view but
    // don't rank against the next-matchmaking candidates (3929-3944). The
    // comparison subset stays focused on the latter.
    label: 'Preview pool',
    ranges: [
      { min: 3865, max: 3896 },
      { min: 3929, max: 3944 },
    ],
    comparisonRanges: [{ min: 3929, max: 3944 }],
    allowedTabs: new Set(['table', 'comparison']),
  },
};

function ranged(kd: number, ranges: readonly KdRange[]): boolean {
  for (const r of ranges) if (kd >= r.min && kd <= r.max) return true;
  return false;
}

/** True when `kingdomId` falls inside any of the pool's ranges. */
export function isInPool(kingdomId: number, pool: KdPool): boolean {
  return ranged(kingdomId, pool.ranges);
}

/** True when `kingdomId` is part of the pool's comparison subset (or the full
 *  pool, if no narrower subset is defined). */
export function isInComparison(kingdomId: number, pool: KdPool): boolean {
  return ranged(kingdomId, pool.comparisonRanges ?? pool.ranges);
}

/** Builder for an array filter — keeps just the KDs that fit the pool. */
export function poolFilter(pool: KdPool): (kd: number) => boolean {
  return (kd) => isInPool(kd, pool);
}

/** Builder for an array filter — keeps just the KDs that fit the comparison
 *  subset (or full pool if no subset is defined). */
export function comparisonFilter(pool: KdPool): (kd: number) => boolean {
  return (kd) => isInComparison(kd, pool);
}

/** Enumerate every kingdom_id in the pool. Used for Postgres `.in()` clauses. */
export function poolKingdomIds(pool: KdPool): number[] {
  const ids: number[] = [];
  for (const r of pool.ranges) {
    for (let k = r.min; k <= r.max; k++) ids.push(k);
  }
  return ids;
}

/** Span of the comparison subset (or the whole pool when no subset is set). */
export function poolComparisonSpan(pool: KdPool): { min: number; max: number } {
  const ranges = pool.comparisonRanges ?? pool.ranges;
  let min = Infinity, max = -Infinity;
  for (const r of ranges) {
    if (r.min < min) min = r.min;
    if (r.max > max) max = r.max;
  }
  return { min, max };
}

/** Human-readable range string for headers — e.g. "3897–3928" for the current
 *  pool, "3865–3896, 3929–3944" for the preview pool. */
export function formatPoolRanges(pool: KdPool): string {
  return pool.ranges.map((r) => r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`).join(', ');
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
