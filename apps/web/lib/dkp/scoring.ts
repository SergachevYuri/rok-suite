// Pure scoring logic for the DKP page, extracted so the same algorithm can run
// against any player set (alliance roster, kingdom-wide top-N scan slice, etc.)
// Not coupled to React or Supabase.

import type { Player } from '@/app/dkp/data';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BandFormula {
  t4Kill: number;
  t5Kill: number;
  t4Death: number;
  t5Death: number;
  rss: number;
  helps: number;
  honor: number;
}

/** The 7 component keys in display order. */
export const FORMULA_KEYS = ['t4Kill', 't5Kill', 't4Death', 't5Death', 'rss', 'helps', 'honor'] as const;
export type FormulaKey = (typeof FORMULA_KEYS)[number];

export interface CutoffSet {
  excellent: number;
  approved: number;
  good: number;
}

/** Weights used by the alternate "simple ratio" scoring mode. Just 4 keys — no rss/helps/honor. */
export interface SimpleFormula {
  t4Kill: number;
  t5Kill: number;
  t4Death: number;
  t5Death: number;
}

/** 4 power bands: μT4 < microMidThreshold ≤ mT4 < midStrongThreshold ≤ sT4 < strongT5Threshold ≤ T5. */
export interface Config {
  microMidThreshold: number;
  midStrongThreshold: number;
  strongT5Threshold: number;
  formulaMicroT4: BandFormula;
  formulaMidT4: BandFormula;
  formulaStrongT4: BandFormula;
  formulaT5: BandFormula;
  kpTargetMicroT4: number;
  kpTargetMidT4: number;
  kpTargetStrongT4: number;
  kpTargetT5: number;
  cutoffsMicroT4: CutoffSet;
  cutoffsMidT4: CutoffSet;
  cutoffsStrongT4: CutoffSet;
  cutoffsT5: CutoffSet;
  rankedMode: 'topN' | 'minPower';
  rankedTopN: number;
  rankedMinPower: number;
  simpleFormula: SimpleFormula;
  simpleMultiplier: number;
}

export type Status = 'EXCELLENT' | 'APPROVED' | 'GOOD' | 'REJECTED' | 'UNRANKED';
export type Band = 'microT4' | 'midT4' | 'strongT4' | 't5';

export const BAND_LABELS: Record<Band, string> = { microT4: 'μT4', midT4: 'mT4', strongT4: 'sT4', t5: 'T5' };

/** "Model player" stat profile for a band — the median of the band's top tertile by band-score. */
export interface ModelStats {
  power: number;
  totalKP: number;
  computedDkp: number;
  rssGathered: number;
  allianceHelps: number;
  honorPoints: number;
  /** How many players were in the top-tertile cohort that produced this median. */
  cohortSize: number;
}

export interface ScoredPlayer extends Player {
  computedDkp: number;
  /** Target KP for this player based on their power and the configured multipliers. */
  targetKp: number;
  /** Which multiplier was applied (low or high tier). */
  kpMultiplier: number;
  /** actual KP / target KP — higher is better. */
  kpRatio: number;
  totalDeaths: number;
  /** Kingdom-wide weighted score (0–100, top player in kingdom = 100 in each category). */
  finalScore: number;
  /** Per-band weighted score (0–100, top player in band = 100 in each category). */
  bandScore: number;
  /** Which power band this player belongs to. */
  band: Band;
  /** The model player profile for this player's band. */
  modelStats: ModelStats;
  status: Status;
}

// ─── Default config ─────────────────────────────────────────────────────────

// μT4 — micro accounts, no T5 troops at all.
export const DEFAULT_FORMULA_MICRO: BandFormula = {
  t4Kill: 5, t5Kill: 0, t4Death: 8, t5Death: 0, rss: 5, helps: 5, honor: 10,
};
// mT4 — mid T4, some might have minimal T5 but mostly T4.
export const DEFAULT_FORMULA_MID: BandFormula = {
  t4Kill: 5, t5Kill: 5, t4Death: 8, t5Death: 8, rss: 5, helps: 5, honor: 10,
};
// sT4 — strong T4, actively mixing T4 and T5.
export const DEFAULT_FORMULA_STRONG: BandFormula = {
  t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24, rss: 5, helps: 5, honor: 10,
};
// T5 — whales, full T5 focus.
export const DEFAULT_FORMULA_T5: BandFormula = {
  t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24, rss: 5, helps: 5, honor: 10,
};
export const DEFAULT_CUTOFFS: CutoffSet = { excellent: 60, approved: 35, good: 15 };
export const DEFAULT_SIMPLE_FORMULA: SimpleFormula = { t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24 };

export const DEFAULT_CONFIG: Config = {
  microMidThreshold: 22_000_000,
  midStrongThreshold: 30_000_000,
  strongT5Threshold: 42_000_000,
  formulaMicroT4: { ...DEFAULT_FORMULA_MICRO },
  formulaMidT4: { ...DEFAULT_FORMULA_MID },
  formulaStrongT4: { ...DEFAULT_FORMULA_STRONG },
  formulaT5: { ...DEFAULT_FORMULA_T5 },
  kpTargetMicroT4: 2,
  kpTargetMidT4: 3,
  kpTargetStrongT4: 5,
  kpTargetT5: 10,
  cutoffsMicroT4: { ...DEFAULT_CUTOFFS },
  cutoffsMidT4: { ...DEFAULT_CUTOFFS },
  cutoffsStrongT4: { ...DEFAULT_CUTOFFS },
  cutoffsT5: { ...DEFAULT_CUTOFFS },
  rankedMode: 'topN',
  rankedTopN: 400,
  rankedMinPower: 15_000_000,
  simpleFormula: { ...DEFAULT_SIMPLE_FORMULA },
  simpleMultiplier: 2,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Rescale a formula so its largest nonzero component is ~100. The scoring math is invariant
 *  to a uniform scaling of weights (numerator and denominator both scale), so this is purely
 *  cosmetic — it keeps the slider values in a friendly 0–100 range. */
export function normalizeFormula(f: BandFormula): BandFormula {
  const max = Math.max(0, ...FORMULA_KEYS.map((k) => f[k]));
  if (max <= 0 || max === 100) return { ...f };
  const scale = 100 / max;
  const out = {} as BandFormula;
  for (const k of FORMULA_KEYS) {
    out[k] = Math.round(f[k] * scale);
  }
  return out;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function safeDiv(a: number, b: number): number {
  if (!b || b <= 0) return 0;
  return a / b;
}

export function bandOf(power: number, microMid: number, midStrong: number, strongT5: number): Band {
  if (power >= strongT5) return 't5';
  if (power >= midStrong) return 'strongT4';
  if (power >= microMid) return 'midT4';
  return 'microT4';
}

/** Compute the model-player profile for each band: median of the band's top tertile by band score. */
export function computeModels(
  players: (Player & { computedDkp: number; band: Band; bandScore: number })[],
): Record<Band, ModelStats> {
  const empty: ModelStats = {
    power: 0,
    totalKP: 0,
    computedDkp: 0,
    rssGathered: 0,
    allianceHelps: 0,
    honorPoints: 0,
    cohortSize: 0,
  };
  const out: Record<Band, ModelStats> = { microT4: empty, midT4: empty, strongT4: empty, t5: empty };
  for (const band of ['microT4', 'midT4', 'strongT4', 't5'] as const) {
    const inBand = players.filter((p) => p.band === band);
    if (inBand.length === 0) continue;
    // Top tertile by band score — at least 1 player.
    const sorted = [...inBand].sort((a, b) => b.bandScore - a.bandScore);
    const cohortSize = Math.max(1, Math.ceil(sorted.length / 3));
    const cohort = sorted.slice(0, cohortSize);
    out[band] = {
      power: median(cohort.map((p) => p.power)),
      totalKP: median(cohort.map((p) => p.totalKP)),
      computedDkp: median(cohort.map((p) => p.computedDkp)),
      rssGathered: median(cohort.map((p) => p.rssGathered)),
      allianceHelps: median(cohort.map((p) => p.allianceHelps)),
      honorPoints: median(cohort.map((p) => p.honorPoints)),
      cohortSize,
    };
  }
  return out;
}

// ─── Main entry point ───────────────────────────────────────────────────────

export function computeScores(players: Player[], config: Config): ScoredPlayer[] {
  // 1. Assign each player a band and pull the raw stat value for each formula key.
  const enriched = players.map((p) => {
    const band = bandOf(p.power, config.microMidThreshold, config.midStrongThreshold, config.strongT5Threshold);
    // Legacy "computed DKP" — kept for the table's DKP column and the model-player display.
    // It uses the player's own band's formula coefficients for the four DKP-like components.
    const f =
      band === 'microT4' ? config.formulaMicroT4 : band === 'midT4' ? config.formulaMidT4 : band === 'strongT4' ? config.formulaStrongT4 : config.formulaT5;
    const computedDkp =
      p.t4Kills * f.t4Kill +
      p.t5Kills * f.t5Kill +
      p.t4Deaths * f.t4Death +
      p.t5Deaths * f.t5Death;
    return { ...p, computedDkp, band };
  });

  // 2. Per-band raw maxes for each formula component. Used to normalize each player to 0–100
  //    against their own band, which is what makes the score fair across bands.
  // Clamp to 0 — some kingdom exports contain negative deltas (e.g. power loss between snapshots).
  const rawValue = (p: Player, key: FormulaKey): number => {
    switch (key) {
      case 't4Kill': return Math.max(0, p.t4Kills);
      case 't5Kill': return Math.max(0, p.t5Kills);
      case 't4Death': return Math.max(0, p.t4Deaths);
      case 't5Death': return Math.max(0, p.t5Deaths);
      case 'rss': return Math.max(0, p.rssGathered);
      case 'helps': return Math.max(0, p.allianceHelps);
      case 'honor': return Math.max(0, p.honorPoints);
    }
  };
  const bandComponentMax = (band: Band): Record<FormulaKey, number> => {
    const inBand = enriched.filter((p) => p.band === band);
    const out = {} as Record<FormulaKey, number>;
    for (const k of FORMULA_KEYS) {
      out[k] = Math.max(0, ...inBand.map((p) => rawValue(p, k)));
    }
    return out;
  };
  const bandMaxes: Record<Band, Record<FormulaKey, number>> = {
    microT4: bandComponentMax('microT4'),
    midT4: bandComponentMax('midT4'),
    strongT4: bandComponentMax('strongT4'),
    t5: bandComponentMax('t5'),
  };

  // Kingdom-wide maxes — only used by the kingdom-wide Score column (kept as a secondary view).
  const kMax: Record<FormulaKey, number> = {} as Record<FormulaKey, number>;
  for (const k of FORMULA_KEYS) {
    kMax[k] = Math.max(0, ...enriched.map((p) => rawValue(p, k)));
  }

  // 3. Score = weighted average of (raw / band-max × 100) across the 7 components.
  const scoreFor = (
    p: Player,
    f: BandFormula,
    maxes: Record<FormulaKey, number>,
  ): number => {
    let num = 0;
    let den = 0;
    for (const k of FORMULA_KEYS) {
      const w = f[k];
      if (w <= 0) continue;
      const sub = safeDiv(rawValue(p, k), maxes[k]) * 100;
      num += sub * w;
      den += w;
    }
    return den > 0 ? num / den : 0;
  };

  const firstPass = enriched.map((p) => {
    const f =
      p.band === 'microT4' ? config.formulaMicroT4 : p.band === 'midT4' ? config.formulaMidT4 : p.band === 'strongT4' ? config.formulaStrongT4 : config.formulaT5;
    // Per-band normalized score — this is what drives the status tier.
    const bandScore = scoreFor(p, f, bandMaxes[p.band]);
    // Kingdom-wide normalized score — secondary "vs the whole kingdom" view.
    const finalScore = scoreFor(p, f, kMax);
    return { ...p, bandScore, finalScore };
  });

  // 4. Build the per-band model player from the top tertile of each band.
  const models = computeModels(firstPass);

  // Power-rank cutoff for REVIEW: anyone outside the top N by current power isn't actively
  // tracked (farms / inactives / fillers), so they should never be flagged for officer review.
  // They still appear in the table — they just fall into GOOD instead of REVIEW.
  // Determine which players are "ranked" (eligible for EXCELLENT/STRONG/GOOD/REVIEW).
  // Two modes: top N by power, or minimum power threshold.
  const inReviewPool = new Set<number>(
    config.rankedMode === 'topN'
      ? [...firstPass]
          .sort((a, b) => b.power - a.power)
          .slice(0, config.rankedTopN)
          .map((p) => p.characterId)
      : firstPass
          .filter((p) => p.power >= config.rankedMinPower)
          .map((p) => p.characterId),
  );

  // 5. Final pass: attach KP target and band-specific status.
  return firstPass.map((p) => {
    const kpMultiplier =
      p.band === 'microT4'
        ? config.kpTargetMicroT4
        : p.band === 'midT4'
          ? config.kpTargetMidT4
          : p.band === 'strongT4'
            ? config.kpTargetStrongT4
            : config.kpTargetT5;
    const targetKp = p.power * kpMultiplier;
    const kpRatio = safeDiv(p.totalKP, targetKp);

    // Per-band cutoffs — judged against the player's own band score, not the kingdom score.
    const cuts =
      p.band === 'microT4'
        ? config.cutoffsMicroT4
        : p.band === 'midT4'
          ? config.cutoffsMidT4
          : p.band === 'strongT4'
            ? config.cutoffsStrongT4
            : config.cutoffsT5;

    let status: Status;
    if (!inReviewPool.has(p.characterId)) {
      status = 'UNRANKED';
    } else if (p.bandScore >= cuts.excellent) status = 'EXCELLENT';
    else if (p.bandScore >= cuts.approved) status = 'APPROVED';
    else if (p.bandScore >= cuts.good) status = 'GOOD';
    else status = 'REJECTED';

    return {
      ...p,
      computedDkp: p.computedDkp,
      targetKp,
      kpMultiplier,
      kpRatio,
      totalDeaths: p.t4Deaths + p.t5Deaths,
      finalScore: p.finalScore,
      bandScore: p.bandScore,
      band: p.band,
      modelStats: models[p.band],
      status,
    };
  });
}
