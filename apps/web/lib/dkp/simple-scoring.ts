// Simple DKP scoring for the reworked DKP page.
//
// Model:
//   dkp = t5Deaths * X + t4Deaths * Y + t5Kills * A + t4Kills * B
//   tier = first tier where tier.minPower <= player.power (search desc)
//   dkpRatio    = dkp / tier.targetDkp
//   deathsRatio = (t5d + t4d) / tier.targetDeaths
//   ratio       = min(dkpRatio, deathsRatio) — both must be met
//   status      = cutoffs applied to ratio (excellent / approved / good / rejected)

import type { Player } from '@/app/dkp/data';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SimpleFormula {
  t5Death: number;
  t4Death: number;
  t5Kill: number;
  t4Kill: number;
}

export interface PowerTier {
  /** Stable react key. */
  id: string;
  /** Short label shown in the player table. */
  label: string;
  /** Player falls into the highest tier where this threshold <= player.power. */
  minPower: number;
  /** Target DKP for the whole measurement period (no per-day scaling). */
  targetDkp: number;
  /** Target total deaths (T4+T5) for the whole period. */
  targetDeaths: number;
}

export interface SimpleCutoffs {
  /** Ratio threshold (0..1+) at which a player is marked EXCELLENT. */
  excellent: number;
  /** Ratio threshold at which a player is marked APPROVED. */
  approved: number;
  /** Ratio threshold at which a player is marked GOOD. Below this → REJECTED. */
  good: number;
}

export interface FlatTarget {
  dkp: number;
  deaths: number;
}

export interface SimpleConfig {
  version: 1;
  formula: SimpleFormula;
  /** "flat" applies the same target to everyone; "tiered" uses the tier list. */
  tierMode: 'flat' | 'tiered';
  /** Used when tierMode === 'flat'. */
  flatTarget: FlatTarget;
  /** Used when tierMode === 'tiered'. Sorted ASC by minPower at save time. */
  tiers: PowerTier[];
  cutoffs: SimpleCutoffs;
  /** If > 0, only the top-N players by power get a tier/target. Rest = UNRANKED.
   *  0 means "score everyone". */
  topN: number;
}

export type SimpleStatus = 'EXCELLENT' | 'APPROVED' | 'GOOD' | 'REJECTED' | 'UNRANKED';

export interface SimpleScoredPlayer {
  characterId: number;
  username: string;
  power: number;
  t5Deaths: number;
  t4Deaths: number;
  t5Kills: number;
  t4Kills: number;
  totalKP: number;
  dkp: number;
  totalDeaths: number;
  tier: PowerTier | null;
  dkpRatio: number;
  deathsRatio: number;
  /** min(dkpRatio, deathsRatio). 0 if tier missing. */
  ratio: number;
  status: SimpleStatus;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_SIMPLE_FORMULA: SimpleFormula = {
  t5Death: 20,
  t4Death: 5,
  t5Kill: 10,
  t4Kill: 2,
};

export const DEFAULT_SIMPLE_CUTOFFS: SimpleCutoffs = {
  excellent: 1.0,
  approved: 0.8,
  good: 0.5,
};

export const DEFAULT_SIMPLE_TIERS: PowerTier[] = [
  { id: 'tier-mu', label: 'μ', minPower: 0, targetDkp: 30_000_000, targetDeaths: 2_000_000 },
  { id: 'tier-a', label: 'A', minPower: 20_000_000, targetDkp: 80_000_000, targetDeaths: 6_000_000 },
  { id: 'tier-b', label: 'B', minPower: 30_000_000, targetDkp: 150_000_000, targetDeaths: 12_000_000 },
  { id: 'tier-c', label: 'C', minPower: 40_000_000, targetDkp: 240_000_000, targetDeaths: 20_000_000 },
  { id: 'tier-d', label: 'D', minPower: 60_000_000, targetDkp: 400_000_000, targetDeaths: 35_000_000 },
];

export const DEFAULT_FLAT_TARGET: FlatTarget = {
  dkp: 150_000_000,
  deaths: 12_000_000,
};

export const DEFAULT_SIMPLE_CONFIG: SimpleConfig = {
  version: 1,
  formula: { ...DEFAULT_SIMPLE_FORMULA },
  tierMode: 'tiered',
  flatTarget: { ...DEFAULT_FLAT_TARGET },
  tiers: DEFAULT_SIMPLE_TIERS.map((t) => ({ ...t })),
  cutoffs: { ...DEFAULT_SIMPLE_CUTOFFS },
  topN: 0,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function sortTiersAsc(tiers: PowerTier[]): PowerTier[] {
  return [...tiers].sort((a, b) => a.minPower - b.minPower);
}

/** Find the highest-min tier whose minPower ≤ power. Returns null if none. */
export function tierForPower(power: number, sortedTiers: PowerTier[]): PowerTier | null {
  let match: PowerTier | null = null;
  for (const t of sortedTiers) {
    if (t.minPower <= power) match = t;
    else break;
  }
  return match;
}

export function classifyRatio(ratio: number, cutoffs: SimpleCutoffs): SimpleStatus {
  if (ratio >= cutoffs.excellent) return 'EXCELLENT';
  if (ratio >= cutoffs.approved) return 'APPROVED';
  if (ratio >= cutoffs.good) return 'GOOD';
  return 'REJECTED';
}

// ─── Filename → metadata ────────────────────────────────────────────────────

export interface FilenameMeta {
  /** Kingdom id extracted from the filename, e.g. 3923. null if not present. */
  kingdomId: number | null;
  /** YYYY-MM-DD. */
  start: string;
  end: string;
  /** Inclusive day count (start == end ⇒ 1). */
  days: number;
}

/** Backward-compat alias. */
export type FilenameDateRange = FilenameMeta;

// Accepts both:
//   3923_20260625_20260625        ← preferred, KvK rework
//   20260625_20260625             ← legacy, kingdomId stays null
const NAME_META_RE = /^(?:(\d{4})[_-])?(\d{8})[_-](\d{8})/;

/** Parse "[KDID_]YYYYMMDD_YYYYMMDD" out of a filename. Returns null if not matched. */
export function parseFilenameMeta(filename: string): FilenameMeta | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const m = NAME_META_RE.exec(base);
  if (!m) return null;
  const startISO = toIso(m[2]);
  const endISO = toIso(m[3]);
  if (!startISO || !endISO) return null;
  const startMs = Date.parse(`${startISO}T00:00:00Z`);
  const endMs = Date.parse(`${endISO}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const days = Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
  const kingdomId = m[1] ? parseInt(m[1], 10) : null;
  return { kingdomId, start: startISO, end: endISO, days };
}

/** @deprecated use parseFilenameMeta — kept so older call sites still compile. */
export function parseFilenameDateRange(filename: string): FilenameDateRange | null {
  return parseFilenameMeta(filename);
}

function toIso(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/** Resolve tiers for scoring based on the config's tierMode. */
function resolveTiers(config: SimpleConfig): PowerTier[] {
  if (config.tierMode === 'flat') {
    return [
      {
        id: 'flat',
        label: 'All',
        minPower: 0,
        targetDkp: config.flatTarget.dkp,
        targetDeaths: config.flatTarget.deaths,
      },
    ];
  }
  return sortTiersAsc(config.tiers);
}

export function computeSimpleScores(
  players: Player[],
  config: SimpleConfig,
): SimpleScoredPlayer[] {
  const tiers = resolveTiers(config);
  const f = config.formula;

  // When topN > 0, only the top-N players by power get a tier (rest = UNRANKED).
  let eligibleIds: Set<number> | null = null;
  if (config.topN > 0) {
    eligibleIds = new Set(
      [...players]
        .sort((a, b) => b.power - a.power)
        .slice(0, config.topN)
        .map((p) => p.characterId),
    );
  }

  return players.map((p) => {
    const t5d = p.t5Deaths ?? 0;
    const t4d = p.t4Deaths ?? 0;
    const t5k = p.t5Kills ?? 0;
    const t4k = p.t4Kills ?? 0;
    const dkp = t5d * f.t5Death + t4d * f.t4Death + t5k * f.t5Kill + t4k * f.t4Kill;
    const totalDeaths = t5d + t4d;

    const eligible = eligibleIds === null || eligibleIds.has(p.characterId);
    const tier = eligible ? tierForPower(p.power, tiers) : null;

    let dkpRatio = 0;
    let deathsRatio = 0;
    let ratio = 0;
    let status: SimpleStatus = 'UNRANKED';
    if (tier) {
      dkpRatio = tier.targetDkp > 0 ? dkp / tier.targetDkp : 0;
      deathsRatio = tier.targetDeaths > 0 ? totalDeaths / tier.targetDeaths : 0;
      ratio = Math.min(dkpRatio, deathsRatio);
      status = classifyRatio(ratio, config.cutoffs);
    }

    return {
      characterId: p.characterId,
      username: p.username,
      power: p.power,
      t5Deaths: t5d,
      t4Deaths: t4d,
      t5Kills: t5k,
      t4Kills: t4k,
      totalKP: p.totalKP ?? 0,
      dkp,
      totalDeaths,
      tier,
      dkpRatio,
      deathsRatio,
      ratio,
      status,
    };
  });
}

// ─── Config merge (safe load from Supabase) ─────────────────────────────────

export function mergeSimpleConfig(
  base: SimpleConfig,
  partial: Partial<SimpleConfig> | null | undefined,
): SimpleConfig {
  if (!partial) return base;
  const tiers = Array.isArray(partial.tiers) && partial.tiers.length > 0
    ? partial.tiers.map((t, i) => ({
        id: t.id || `tier-${i}`,
        label: t.label || `Tier ${i + 1}`,
        minPower: Number.isFinite(t.minPower) ? t.minPower : 0,
        targetDkp: Number.isFinite(t.targetDkp) ? t.targetDkp : 0,
        targetDeaths: Number.isFinite(t.targetDeaths) ? t.targetDeaths : 0,
      }))
    : base.tiers;
  return {
    version: 1,
    formula: { ...base.formula, ...(partial.formula ?? {}) },
    tierMode: partial.tierMode === 'flat' || partial.tierMode === 'tiered' ? partial.tierMode : base.tierMode,
    flatTarget: { ...base.flatTarget, ...(partial.flatTarget ?? {}) },
    tiers,
    cutoffs: { ...base.cutoffs, ...(partial.cutoffs ?? {}) },
    topN: Number.isFinite(partial.topN) && partial.topN! >= 0 ? partial.topN! : base.topN,
  };
}
