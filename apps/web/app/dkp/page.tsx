'use client';

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppSidebar } from '@/components/AppSidebar';
import {
  ArrowUpDown,
  Search,
  Upload,
  Lock,
  LogOut,
  X,
  Rocket,
  RotateCcw,
  ChevronDown,
  Settings2,
  Info,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { WarRoomAuthProvider, useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import {
  Player,
  DkpDataset,
  parseStatsFile,
  parseHonorFile,
  mergeIntoPlayers,
  looseMatch,
  loadLatestDataset,
  saveDataset,
  deleteDataset,
  loadSharedConfig,
  saveSharedConfig,
  subscribeToSharedConfig,
} from './data';

/** Flat 7-component formula: every raw stat the score uses, in one place. Each weight applies
 *  directly to that stat after per-band normalization (player value ÷ band max). */
interface BandFormula {
  t4Kill: number;
  t5Kill: number;
  t4Death: number;
  t5Death: number;
  rss: number;
  helps: number;
  honor: number;
}

/** The 7 component keys in display order. */
const FORMULA_KEYS = ['t4Kill', 't5Kill', 't4Death', 't5Death', 'rss', 'helps', 'honor'] as const;
type FormulaKey = (typeof FORMULA_KEYS)[number];

interface CutoffSet {
  excellent: number;
  approved: number;
  good: number;
}

interface Config {
  // Power band boundaries. mT4 < mt4T4Threshold ≤ T4 < t4T5Threshold ≤ T5.
  mt4T4Threshold: number;
  t4T5Threshold: number;
  // One flat 7-component formula per band.
  formulaMt4: BandFormula;
  formulaT4: BandFormula;
  formulaT5: BandFormula;
  // KP target multipliers per band — informational only (drives the KP cell color).
  kpTargetMt4: number;
  kpTargetT4: number;
  kpTargetT5: number;
  // Status cutoffs per band, applied to the 0–100 per-band score.
  cutoffsMt4: CutoffSet;
  cutoffsT4: CutoffSet;
  cutoffsT5: CutoffSet;
}

// mT4 sees no T5 troops, so the T5 components default to 0.
const DEFAULT_FORMULA_MT4: BandFormula = {
  t4Kill: 5, t5Kill: 0, t4Death: 8, t5Death: 0, rss: 5, helps: 5, honor: 10,
};
const DEFAULT_FORMULA_T4: BandFormula = {
  t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24, rss: 5, helps: 5, honor: 10,
};
const DEFAULT_FORMULA_T5: BandFormula = {
  t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24, rss: 5, helps: 5, honor: 10,
};
const DEFAULT_CUTOFFS: CutoffSet = { excellent: 60, approved: 35, good: 15 };

const DEFAULT_CONFIG: Config = {
  mt4T4Threshold: 30_000_000,
  t4T5Threshold: 42_000_000,
  formulaMt4: { ...DEFAULT_FORMULA_MT4 },
  formulaT4: { ...DEFAULT_FORMULA_T4 },
  formulaT5: { ...DEFAULT_FORMULA_T5 },
  kpTargetMt4: 2,
  kpTargetT4: 3,
  kpTargetT5: 10,
  cutoffsMt4: { ...DEFAULT_CUTOFFS },
  cutoffsT4: { ...DEFAULT_CUTOFFS },
  cutoffsT5: { ...DEFAULT_CUTOFFS },
};

/** Rescale a formula so its largest nonzero component is ~100. The scoring math is invariant
 *  to a uniform scaling of weights (numerator and denominator both scale), so this is purely
 *  cosmetic — it keeps the slider values in a friendly 0–100 range. */
function normalizeFormula(f: BandFormula): BandFormula {
  const max = Math.max(0, ...FORMULA_KEYS.map((k) => f[k]));
  if (max <= 0 || max === 100) return { ...f };
  const scale = 100 / max;
  const out = {} as BandFormula;
  for (const k of FORMULA_KEYS) {
    out[k] = Math.round(f[k] * scale);
  }
  return out;
}

/** Build a flat BandFormula by combining a legacy DKP formula with a legacy 4-component weight set.
 *  The legacy model was: dkpRaw = t4K*c1 + t5K*c2 + t4D*c3 + t5D*c4, then score = dkpRaw*wDkp + rss*wRss + ...
 *  In the new flat model each weight applies after band-normalization, so we just multiply each
 *  legacy DKP coefficient by the legacy DKP weight to get the unified per-stat weight.
 */
function legacyToBandFormula(
  defaultFormula: BandFormula,
  dkpFormula: { t4Kill?: number; t5Kill?: number; t4Death?: number; t5Death?: number } | undefined,
  legacyWeights:
    | { dkp?: number; rss?: number; helps?: number; honor?: number }
    | undefined,
): BandFormula {
  if (!dkpFormula && !legacyWeights) return { ...defaultFormula };
  const f = { t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24, ...(dkpFormula ?? {}) };
  let w = legacyWeights ?? { dkp: 80, rss: 5, helps: 5, honor: 10 };
  // Old weight sets sometimes used 0–1 decimal scale; rescale to 0–100 if so.
  const wVals = Object.values(w).filter((v): v is number => typeof v === 'number');
  if (wVals.length > 0 && Math.max(...wVals) <= 1) {
    w = Object.fromEntries(
      Object.entries(w).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) : v]),
    );
  }
  const dkpW = w.dkp ?? 0;
  return {
    t4Kill: Math.round(f.t4Kill * dkpW),
    t5Kill: Math.round(f.t5Kill * dkpW),
    t4Death: Math.round(f.t4Death * dkpW),
    t5Death: Math.round(f.t5Death * dkpW),
    rss: Math.round(w.rss ?? 0),
    helps: Math.round(w.helps ?? 0),
    honor: Math.round(w.honor ?? 0),
  };
}

/** Migrate a legacy 0–3 cutoff set into the 0–100 scale used now. */
function migrateCutoffs(
  t: Partial<CutoffSet> | undefined,
): Partial<CutoffSet> {
  if (!t) return {};
  const vals = Object.values(t).filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return t;
  if (Math.max(...vals) <= 3) {
    const out: Partial<CutoffSet> = {};
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === 'number') (out as Record<string, number>)[k] = Math.round((v / 3) * 100);
    }
    return out;
  }
  return t;
}

/** Merge a partial remote config onto a base, preserving nested defaults.
 *  Also migrates older schemas (legacy 2-band low/high, intermediate 3-band split-DKP-formula)
 *  into the new flat 7-component-per-band schema.
 */
function mergeConfig(base: Config, partial: Partial<Config> | null | undefined): Config {
  if (!partial) return base;
  // Permissive shape: include legacy fields no longer in Config so the migration can read them.
  const legacy = partial as Partial<Config> & {
    weightsLow?: { dkp?: number; rss?: number; helps?: number; honor?: number };
    weightsHigh?: { dkp?: number; rss?: number; helps?: number; honor?: number };
    weightsMt4?: { dkp?: number; rss?: number; helps?: number; honor?: number };
    weightsT4?: { dkp?: number; rss?: number; helps?: number; honor?: number };
    weightsT5?: { dkp?: number; rss?: number; helps?: number; honor?: number };
    weightSplitThreshold?: number;
    dkpFormula?: { t4Kill?: number; t5Kill?: number; t4Death?: number; t5Death?: number };
    kpTargetLow?: number;
    kpTargetHigh?: number;
    statusThresholds?: Partial<CutoffSet>;
  };

  const mt4T4Threshold = partial.mt4T4Threshold ?? base.mt4T4Threshold;
  const t4T5Threshold = partial.t4T5Threshold ?? legacy.weightSplitThreshold ?? base.t4T5Threshold;

  // Per-band flat formula: prefer the new key, otherwise reconstruct from legacy split parts.
  const legacyMt4 = legacy.weightsMt4 ?? legacy.weightsLow;
  const legacyT4 = legacy.weightsT4 ?? legacy.weightsLow;
  const legacyT5 = legacy.weightsT5 ?? legacy.weightsHigh;
  // Always normalize on load so formulas migrated from legacy configs (which combined a 4-coef
  // DKP formula with a 0–100 weight, producing values like 1920) get rescaled into 0–100.
  const formulaMt4 = normalizeFormula(
    partial.formulaMt4
      ? { ...base.formulaMt4, ...partial.formulaMt4 }
      : legacyToBandFormula(base.formulaMt4, legacy.dkpFormula, legacyMt4),
  );
  const formulaT4 = normalizeFormula(
    partial.formulaT4
      ? { ...base.formulaT4, ...partial.formulaT4 }
      : legacyToBandFormula(base.formulaT4, legacy.dkpFormula, legacyT4),
  );
  const formulaT5 = normalizeFormula(
    partial.formulaT5
      ? { ...base.formulaT5, ...partial.formulaT5 }
      : legacyToBandFormula(base.formulaT5, legacy.dkpFormula, legacyT5),
  );

  // Per-band cutoffs: new keys, falling back to the single legacy statusThresholds set.
  const legacyCuts = migrateCutoffs(legacy.statusThresholds);
  const cutoffsMt4 = { ...base.cutoffsMt4, ...legacyCuts, ...(partial.cutoffsMt4 ?? {}) };
  const cutoffsT4 = { ...base.cutoffsT4, ...legacyCuts, ...(partial.cutoffsT4 ?? {}) };
  const cutoffsT5 = { ...base.cutoffsT5, ...legacyCuts, ...(partial.cutoffsT5 ?? {}) };

  const kpTargetMt4 = partial.kpTargetMt4 ?? legacy.kpTargetLow ?? base.kpTargetMt4;
  const kpTargetT4 = partial.kpTargetT4 ?? legacy.kpTargetLow ?? base.kpTargetT4;
  const kpTargetT5 = partial.kpTargetT5 ?? legacy.kpTargetHigh ?? base.kpTargetT5;

  return {
    ...base,
    ...partial,
    mt4T4Threshold,
    t4T5Threshold,
    formulaMt4,
    formulaT4,
    formulaT5,
    kpTargetMt4,
    kpTargetT4,
    kpTargetT5,
    cutoffsMt4,
    cutoffsT4,
    cutoffsT5,
  };
}

type Status = 'EXCELLENT' | 'APPROVED' | 'GOOD' | 'REJECTED';

/** Friendlier display labels (REJECTED → REVIEW). */
const STATUS_LABELS: Record<Status, string> = {
  EXCELLENT: 'EXCELLENT',
  APPROVED: 'STRONG',
  GOOD: 'GOOD',
  REJECTED: 'REVIEW',
};

/** Power band a player belongs to. mT4 < mt4T4Threshold ≤ T4 < t4T5Threshold ≤ T5. */
type Band = 'micro' | 't4' | 't5';
const BAND_LABELS: Record<Band, string> = { micro: 'mT4', t4: 'T4', t5: 'T5' };

/** "Model player" stat profile for a band — the median of the band's top tertile by band-score. */
interface ModelStats {
  power: number;
  totalKP: number;
  computedDkp: number;
  rssGathered: number;
  allianceHelps: number;
  honorPoints: number;
  /** How many players were in the top-tertile cohort that produced this median. */
  cohortSize: number;
}

interface ScoredPlayer extends Player {
  computedDkp: number;
  /** Target KP for this player based on their power and the configured multipliers. */
  targetKp: number;
  /** Which multiplier was applied (low or high tier). */
  kpMultiplier: number;
  /** actual KP / target KP — higher is better. */
  kpRatio: number;
  totalDeaths: number;
  scoreDkp: number;
  scoreRss: number;
  scoreHelps: number;
  scoreHonor: number;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function safeDiv(a: number, b: number): number {
  if (!b || b <= 0) return 0;
  return a / b;
}

function bandOf(power: number, mt4T4Threshold: number, t4T5Threshold: number): Band {
  if (power >= t4T5Threshold) return 't5';
  if (power >= mt4T4Threshold) return 't4';
  return 'micro';
}

/** Compute the model-player profile for each band: median of the band's top tertile by band score. */
function computeModels(
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
  const out: Record<Band, ModelStats> = { micro: empty, t4: empty, t5: empty };
  for (const band of ['micro', 't4', 't5'] as const) {
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

function computeScores(players: Player[], config: Config): ScoredPlayer[] {
  // 1. Assign each player a band and pull the raw stat value for each formula key.
  const enriched = players.map((p) => {
    const band = bandOf(p.power, config.mt4T4Threshold, config.t4T5Threshold);
    // Legacy "computed DKP" — kept for the table's DKP column and the model-player display.
    // It uses the player's own band's formula coefficients for the four DKP-like components.
    const f =
      band === 'micro' ? config.formulaMt4 : band === 't4' ? config.formulaT4 : config.formulaT5;
    const computedDkp =
      p.t4Kills * f.t4Kill +
      p.t5Kills * f.t5Kill +
      p.t4Deaths * f.t4Death +
      p.t5Deaths * f.t5Death;
    return { ...p, computedDkp, band };
  });

  // 2. Per-band raw maxes for each formula component. Used to normalize each player to 0–100
  //    against their own band, which is what makes the score fair across bands.
  const rawValue = (p: Player, key: FormulaKey): number => {
    switch (key) {
      case 't4Kill': return p.t4Kills;
      case 't5Kill': return p.t5Kills;
      case 't4Death': return p.t4Deaths;
      case 't5Death': return p.t5Deaths;
      case 'rss': return p.rssGathered;
      case 'helps': return p.allianceHelps;
      case 'honor': return p.honorPoints;
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
    micro: bandComponentMax('micro'),
    t4: bandComponentMax('t4'),
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
      p.band === 'micro' ? config.formulaMt4 : p.band === 't4' ? config.formulaT4 : config.formulaT5;
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
  const REVIEW_POWER_RANK_CUTOFF = 400;
  const inReviewPool = new Set<number>(
    [...firstPass]
      .sort((a, b) => b.power - a.power)
      .slice(0, REVIEW_POWER_RANK_CUTOFF)
      .map((p) => p.characterId),
  );

  // 5. Final pass: attach KP target and band-specific status.
  return firstPass.map((p) => {
    const kpMultiplier =
      p.band === 'micro'
        ? config.kpTargetMt4
        : p.band === 't4'
          ? config.kpTargetT4
          : config.kpTargetT5;
    const targetKp = p.power * kpMultiplier;
    const kpRatio = safeDiv(p.totalKP, targetKp);

    // Per-band cutoffs — judged against the player's own band score, not the kingdom score.
    const cuts =
      p.band === 'micro'
        ? config.cutoffsMt4
        : p.band === 't4'
          ? config.cutoffsT4
          : config.cutoffsT5;

    let status: Status;
    if (p.bandScore >= cuts.excellent) status = 'EXCELLENT';
    else if (p.bandScore >= cuts.approved) status = 'APPROVED';
    else if (p.bandScore >= cuts.good) status = 'GOOD';
    else if (inReviewPool.has(p.characterId)) status = 'REJECTED';
    else status = 'GOOD';

    return {
      ...p,
      computedDkp: p.computedDkp,
      targetKp,
      kpMultiplier,
      kpRatio,
      totalDeaths: p.t4Deaths + p.t5Deaths,
      // Sub-score fields no longer used by the table but kept on the type for compat.
      scoreDkp: 0,
      scoreRss: 0,
      scoreHelps: 0,
      scoreHonor: 0,
      finalScore: p.finalScore,
      bandScore: p.bandScore,
      band: p.band,
      modelStats: models[p.band],
      status,
    };
  });
}

const nf = new Intl.NumberFormat('en-US');
const fmt = (n: number) => nf.format(Math.round(n));
/** Format large numbers as millions with 2 decimals (e.g. 69_861_875 → "69.86M"). */
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(2)}M`;
/** Display the final score as a 0–100 number rounded to one decimal. */
const fmtScore = (n: number) => n.toFixed(1);
/** Compact integer format like 1.2M / 340K / 1,234. */
function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return (n / 1_000_000_000).toFixed(a >= 10_000_000_000 ? 0 : 1) + 'B';
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + 'M';
  if (a >= 10_000) return Math.round(n / 1_000) + 'K';
  return nf.format(Math.round(n));
}

// Status palette is intentionally distinct from the KP cell palette (green/amber/red).
// This way the Score color matches the Status pill color and there's no collision.
const STATUS_STYLES: Record<Status, string> = {
  EXCELLENT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  APPROVED: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  GOOD: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

/** Tailwind text-only class for each status — used to color the Score column to match the pill. */
const STATUS_TEXT: Record<Status, string> = {
  EXCELLENT: 'text-violet-400',
  APPROVED: 'text-cyan-400',
  GOOD: 'text-indigo-400',
  REJECTED: 'text-rose-400',
};

type SortKey =
  | 'username'
  | 'power'
  | 't4Kills'
  | 't5Kills'
  | 'totalKP'
  | 'targetKp'
  | 't4Deaths'
  | 't5Deaths'
  | 'totalDeaths'
  | 'dkp'
  | 'finalScore'
  | 'honorPoints';

interface ColumnDef {
  key: SortKey | 'status';
  label: string;
  numeric?: boolean;
  defaultVisible: boolean;
  hint?: string;
}

/** Translation key for each column's label, used at render time. */
const COLUMN_LABEL_KEYS: Record<ColumnDef['key'], string> = {
  username: 'columns.player',
  power: 'columns.power',
  t4Kills: 'columns.t4Kp',
  t5Kills: 'columns.t5Kp',
  totalKP: 'columns.totalKp',
  targetKp: 'columns.targetKp',
  t4Deaths: 'columns.t4Deaths',
  t5Deaths: 'columns.t5Deaths',
  totalDeaths: 'columns.totalDeaths',
  dkp: 'columns.dkp',
  finalScore: 'columns.score',
  status: 'columns.status',
  honorPoints: 'columns.honor',
};

const COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Player', defaultVisible: true, hint: 'In-game username from the kingdom export.' },
  { key: 'power', label: 'Power', numeric: true, defaultVisible: true, hint: 'Current power as of the last upload (not highest power).' },
  { key: 't4Kills', label: 'T4 KP', numeric: true, defaultVisible: true, hint: 'T4 kill points from the kingdom export.' },
  { key: 't5Kills', label: 'T5 KP', numeric: true, defaultVisible: true, hint: 'T5 kill points from the kingdom export.' },
  { key: 'totalKP', label: 'Total KP', numeric: true, defaultVisible: true, hint: 'Actual total kill points from the kingdom export. Cell is colored green if this player meets or beats their Target KP, red if they fall short.' },
  { key: 'targetKp', label: 'Target KP', numeric: true, defaultVisible: true, hint: 'KP this player is expected to produce, based on their power. Smaller accounts use the low multiplier, larger accounts the high one (configured in Expected KP).' },
  { key: 't4Deaths', label: 'T4 Deaths', numeric: true, defaultVisible: true, hint: 'T4 troop deaths from the kingdom export.' },
  { key: 't5Deaths', label: 'T5 Deaths', numeric: true, defaultVisible: true, hint: 'T5 troop deaths from the kingdom export.' },
  { key: 'totalDeaths', label: 'Total Deaths', numeric: true, defaultVisible: true, hint: 'T4 + T5 troop deaths combined.' },
  { key: 'dkp', label: 'DKP', numeric: true, defaultVisible: true, hint: 'Raw DKP for this player from the formula in the config panel (T4/T5 kills + T4/T5 deaths weighted).' },
  { key: 'finalScore', label: 'Score', numeric: true, defaultVisible: true, hint: 'Final 0–100 score. Each of DKP, RSS, helps and honor is scored 0–100 relative to the top player in the kingdom for that category, then blended using the score weights. 100 = top player in every weighted category.' },
  { key: 'status', label: 'Status', defaultVisible: true, hint: 'Tier the score lands in (EXCELLENT / STRONG / GOOD / REVIEW).' },
  { key: 'honorPoints', label: 'Honor', numeric: true, defaultVisible: true, hint: 'Raw honor points from the Statmaster honor file (matched by name).' },
];

export default function DkpPage() {
  return (
    <AppSidebar>
      <WarRoomAuthProvider>
        <DkpPageInner />
      </WarRoomAuthProvider>
    </AppSidebar>
  );
}

function DkpPageInner() {
  const t = useTranslations('dkp');
  const { isAtLeast, officerName } = useWarRoomAuth();
  const isOfficer = isAtLeast('officer');

  const [dataset, setDataset] = useState<DkpDataset | null>(null);
  const [loadingDefault, setLoadingDefault] = useState(true);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [publishedConfig, setPublishedConfig] = useState<Config>(DEFAULT_CONFIG);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('finalScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<Status | 'ALL'>('ALL');
  /** When true, numeric stat cells render as ratios vs the player's band model instead of raw values. */
  const [modelView, setModelView] = useState(false);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  );

  // Load shared config from Supabase + subscribe to remote changes.
  // Officers edit a local working copy and "Deploy" publishes to everyone.
  const dirtyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await loadSharedConfig<Partial<Config>>();
      if (cancelled) return;
      const merged = mergeConfig(DEFAULT_CONFIG, remote);
      setPublishedConfig(merged);
      if (!dirtyRef.current) setConfig(merged);
    })();
    const unsubscribe = subscribeToSharedConfig<Partial<Config>>((remote) => {
      const merged = mergeConfig(DEFAULT_CONFIG, remote);
      setPublishedConfig(merged);
      if (!dirtyRef.current) setConfig(merged);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Track whether the working copy diverges from the published config.
  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(publishedConfig),
    [config, publishedConfig],
  );
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  // Load dataset: Supabase latest, fall back to bundled JSON
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await loadLatestDataset();
        if (cancelled) return;
        if (latest) {
          setDataset(latest);
          return;
        }
        const res = await fetch('/data/players_data.json');
        const players: Player[] = await res.json();
        if (cancelled) return;
        setDataset({
          uploadedAt: '',
          uploadedBy: null,
          statsFileName: 'players_data.json (default)',
          honorFileName: null,
          players,
        });
      } catch (e) {
        console.error('Failed to load dataset', e);
      } finally {
        if (!cancelled) setLoadingDefault(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const players = dataset?.players ?? [];
  const scored = useMemo(() => computeScores(players, config), [players, config]);

  // Global rank by current sort, ignoring filters — so search doesn't renumber rows.
  const globalRankById = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...scored].sort((a, b) => {
      if (sortKey === 'username') return a.username.localeCompare(b.username) * dir;
      const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
      return (av - bv) * dir;
    });
    const map = new Map<number, number>();
    sorted.forEach((p, i) => map.set(p.characterId, i + 1));
    return map;
  }, [scored, sortKey, sortDir]);

  const filtered = useMemo(() => {
    let list = scored;
    if (statusFilter !== 'ALL') list = list.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.trim();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(
        (p) =>
          looseMatch(p.username, q) ||
          (qDigits.length >= 3 && String(p.characterId).includes(qDigits)),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === 'username') return a.username.localeCompare(b.username) * dir;
      const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
      return (av - bv) * dir;
    });
    return list;
  }, [scored, search, sortKey, sortDir, statusFilter]);

  const summary = useMemo(() => {
    const counts: Record<Status, number> = { EXCELLENT: 0, APPROVED: 0, GOOD: 0, REJECTED: 0 };
    let totalDkp = 0;
    for (const p of scored) {
      counts[p.status]++;
      totalDkp += p.dkp || p.computedDkp;
    }
    return { counts, totalDkp, total: scored.length };
  }, [scored]);

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      // Normalize each band's formula so its largest weight is ~100 before publishing.
      // The math is invariant to a uniform scale, so this doesn't change anyone's score —
      // it just keeps the slider values in a friendly 0–100 range for everyone on next load.
      const tidied: Config = {
        ...config,
        formulaMt4: normalizeFormula(config.formulaMt4),
        formulaT4: normalizeFormula(config.formulaT4),
        formulaT5: normalizeFormula(config.formulaT5),
      };
      await saveSharedConfig(tidied);
      setConfig(tidied);
      setPublishedConfig(tidied);
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Failed to deploy');
    } finally {
      setDeploying(false);
    }
  };

  const handleDiscardChanges = () => {
    setConfig(publishedConfig);
    setDeployError(null);
  };

  const setFormula = (
    band: 'formulaMt4' | 'formulaT4' | 'formulaT5',
    key: FormulaKey,
    value: number,
  ) => {
    setConfig((c) => ({ ...c, [band]: { ...c[band], [key]: value } }));
  };
  const setCutoff = (
    band: 'cutoffsMt4' | 'cutoffsT4' | 'cutoffsT5',
    key: keyof CutoffSet,
    value: number,
  ) => {
    setConfig((c) => ({ ...c, [band]: { ...c[band], [key]: value } }));
  };

  const toggleCol = (key: string) => {
    setVisibleCols((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'username' ? 'asc' : 'desc');
    }
  };

  const handleDatasetUpload = async (newDataset: DkpDataset) => {
    const saved = await saveDataset({ ...newDataset, uploadedBy: officerName });
    setDataset(saved);
  };

  const handleResetDataset = async () => {
    if (dataset?.id) {
      try {
        await deleteDataset(dataset.id);
      } catch (e) {
        console.error('Failed to delete dataset', e);
      }
    }
    setLoadingDefault(true);
    try {
      const latest = await loadLatestDataset();
      if (latest) {
        setDataset(latest);
        return;
      }
      const res = await fetch('/data/players_data.json');
      const players: Player[] = await res.json();
      setDataset({
        uploadedAt: '',
        uploadedBy: null,
        statsFileName: 'players_data.json (default)',
        honorFileName: null,
        players,
      });
    } finally {
      setLoadingDefault(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2 tracking-wide uppercase">
              {t('kingdomLabel')}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {dataset?.statsFileName
                ? dataset.honorFileName
                  ? t('sourceWithHonor', {
                      file: dataset.statsFileName,
                      honor: dataset.honorFileName,
                    })
                  : t('sourcePrefix', { file: dataset.statsFileName })
                : t('sourceLoading')}
              {dataset?.uploadedBy && t('uploadedBy', { name: dataset.uploadedBy })}
            </p>
          </div>
          <OfficerBadge />
        </header>

        {/* Officer-only upload panel */}
        {isOfficer && (
          <UploadPanel
            onUploaded={handleDatasetUpload}
            onReset={handleResetDataset}
            currentDataset={dataset}
          />
        )}

        {/* Summary */}
        <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-6">
          <SummaryCard label={t('summary.players')} value={fmt(summary.total)} />
          <SummaryCard label={t('summary.totalDkp')} value={fmt(summary.totalDkp)} />
          <SummaryCard label={t('summary.excellent')} value={fmt(summary.counts.EXCELLENT)} tone="excellent" />
          <SummaryCard label={t('summary.strong')} value={fmt(summary.counts.APPROVED)} tone="approved" />
          <SummaryCard label={t('summary.good')} value={fmt(summary.counts.GOOD)} tone="good" />
          <SummaryCard label={t('summary.review')} value={fmt(summary.counts.REJECTED)} tone="review" />
        </section>

        {/* Scoring Configuration (collapsible) */}
        <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setConfigOpen((o) => !o)}
            className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-[var(--background-hover)] transition-colors"
          >
            <Settings2 size={16} className="text-[var(--text-muted)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  {t('config.title')}
                </h2>
                {!isOfficer && (
                  <span className="text-[10px] font-normal text-[var(--text-muted)] uppercase tracking-wider">
                    {t('config.readOnly')}
                  </span>
                )}
                {isOfficer && isDirty && (
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                    {t('config.unsaved')}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                <ConfigSummaryLine config={config} />
              </div>
            </div>
            <ChevronDown
              size={16}
              className={`text-[var(--text-muted)] flex-shrink-0 transition-transform ${configOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {configOpen && (
            <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-[var(--border)] pt-4">
              {/* Top control bar: deploy buttons + split toggle */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {isOfficer && (
                    <>
                      <button
                        onClick={handleDeploy}
                        disabled={!isDirty || deploying}
                        title={t('config.deployHint')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Rocket size={12} />
                        {deploying ? t('config.deploying') : t('config.deploy')}
                      </button>
                      <button
                        onClick={handleDiscardChanges}
                        disabled={!isDirty || deploying}
                        title={t('config.discardHint')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <RotateCcw size={12} />
                        {t('config.discard')}
                      </button>
                      {deployError && <span className="text-xs text-red-400">{deployError}</span>}
                    </>
                  )}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                <span className="font-medium">Band thresholds:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-sky-400">mT4 / T4</span>
                  <PowerInput
                    value={config.mt4T4Threshold}
                    disabled={!isOfficer}
                    onChange={(v) =>
                      setConfig((c) => ({ ...c, mt4T4Threshold: Math.max(0, v) }))
                    }
                  />
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-fuchsia-400">T4 / T5</span>
                  <PowerInput
                    value={config.t4T5Threshold}
                    disabled={!isOfficer}
                    onChange={(v) =>
                      setConfig((c) => ({ ...c, t4T5Threshold: Math.max(0, v) }))
                    }
                  />
                </span>
                <span className="text-[var(--text-muted)]">applied to all band-aware calculations</span>
              </div>


              {/* Quick how-it-works explainer */}
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-[var(--background)]/40 border border-[var(--border)] text-sm text-[var(--text-secondary)] leading-relaxed">
                <Info size={16} className="text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--foreground)]">How it works:</span>{' '}
                  Each category is scored 0–100 relative to the top player in the kingdom for
                  that category.{' '}
                  <span className="text-[var(--text-muted)]">
                    DKP is computed from the formula (T4/T5 kills + deaths). Then DKP, RSS,
                    helps and honor are each divided by the kingdom&apos;s max in that category
                    (top player = 100). Those four sub-scores are blended using the weights to
                    produce a final 0–100 number, which maps to a status tier. Expected KP is
                    independent and only affects the KP cell color. Hover any{' '}
                    <span className="underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
                      dotted label
                    </span>{' '}
                    for details.
                  </span>
                </div>
              </div>

              {/* Reading the Table — wide reference at the top */}
              <ConfigCard
                title={t('readingTableCard.title')}
                hint="Quick reference for what each column and color in the player table means."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start text-sm text-[var(--text-secondary)] leading-relaxed">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      KP cell color
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span>
                          <span className="text-emerald-400 font-medium">Green</span> — at or
                          above target KP (≥100%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
                        <span>
                          <span className="text-amber-400 font-medium">Amber</span> — close, but
                          short (80–99%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full bg-red-400 flex-shrink-0" />
                        <span>
                          <span className="text-red-400 font-medium">Red</span> — well below
                          target (&lt;80%)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Columns
                    </div>
                    <ul className="space-y-1 text-xs">
                      <li>
                        <span className="text-[var(--foreground)] font-medium">KP</span> — actual
                        total kill points
                      </li>
                      <li>
                        <span className="text-[var(--foreground)] font-medium">Target KP</span> —
                        power × the band&apos;s multiplier
                      </li>
                      <li>
                        <span className="text-[var(--foreground)] font-medium">Score</span> —
                        0–100 score within the player&apos;s own band
                      </li>
                      <li>
                        <span className="text-[var(--foreground)] font-medium">Status</span> —
                        tier from that band&apos;s cutoffs
                      </li>
                    </ul>
                  </div>
                </div>
              </ConfigCard>

              {/* Three columns, one per band. Each column has everything that band owns:
                  KP target, score formula, status cutoffs. */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start mt-4">
                <BandColumn
                  band="micro"
                  formula={config.formulaMt4}
                  cutoffs={config.cutoffsMt4}
                  kpTarget={config.kpTargetMt4}
                  powerRangeLabel={`Under ${(config.mt4T4Threshold / 1_000_000).toFixed(0)}M power`}
                  examplePower={Math.max(5_000_000, Math.round(config.mt4T4Threshold / 2 / 5_000_000) * 5_000_000)}
                  disabled={!isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaMt4', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsMt4', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetMt4: v }))}
                />
                <BandColumn
                  band="t4"
                  formula={config.formulaT4}
                  cutoffs={config.cutoffsT4}
                  kpTarget={config.kpTargetT4}
                  powerRangeLabel={`${(config.mt4T4Threshold / 1_000_000).toFixed(0)}M – ${(config.t4T5Threshold / 1_000_000).toFixed(0)}M power`}
                  examplePower={Math.max(5_000_000, Math.round((config.mt4T4Threshold + config.t4T5Threshold) / 2 / 5_000_000) * 5_000_000)}
                  disabled={!isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaT4', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsT4', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetT4: v }))}
                />
                <BandColumn
                  band="t5"
                  formula={config.formulaT5}
                  cutoffs={config.cutoffsT5}
                  kpTarget={config.kpTargetT5}
                  powerRangeLabel={`At or above ${(config.t4T5Threshold / 1_000_000).toFixed(0)}M power`}
                  examplePower={Math.max(5_000_000, Math.round(config.t4T5Threshold * 1.5 / 5_000_000) * 5_000_000)}
                  disabled={!isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaT5', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsT5', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetT5: v }))}
                />
              </div>
            </div>
          )}
        </section>

        {/* Search + view toggle (row 1) */}
        <section className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
            />
          </div>
          <div
            className={`inline-flex rounded-xl p-1 transition-all duration-300 ${
              modelView
                ? 'bg-gradient-to-r from-sky-500/20 via-emerald-500/20 to-fuchsia-500/20 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'bg-gradient-to-r from-sky-500/15 via-emerald-500/15 to-fuchsia-500/15 border border-emerald-500/30 shadow-md shadow-emerald-500/5 animate-pulse-slow'
            }`}
          >
            <button
              type="button"
              onClick={() => setModelView(false)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                !modelView
                  ? 'bg-[var(--foreground)] text-[var(--background)] shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {t('view.raw')}
            </button>
            <button
              type="button"
              onClick={() => setModelView(true)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                modelView
                  ? 'bg-gradient-to-r from-sky-500 via-emerald-500 to-fuchsia-500 text-white shadow-lg'
                  : 'text-[var(--foreground)] hover:bg-[var(--background-card)]/60'
              }`}
            >
              <Sparkles size={14} className={modelView ? 'text-white' : 'text-emerald-400'} />
              <span className="hidden sm:inline">{t('view.modelLong')}</span>
              <span className="sm:hidden">{t('view.model')}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setModelInfoOpen(true)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-card)] transition-colors"
            aria-label={t('view.howWorks')}
            title={t('view.howWorks')}
          >
            <Info size={16} />
          </button>
        </section>

        {/* Status filter pills (row 2) — horizontal scroll on mobile */}
        <section className="mb-3 -mx-1 overflow-x-auto">
          <div className="px-1 flex gap-1 whitespace-nowrap">
            {(['ALL', 'EXCELLENT', 'APPROVED', 'GOOD', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
                  statusFilter === s
                    ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]'
                    : 'bg-[var(--background-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--foreground)]'
                }`}
              >
                {s === 'ALL'
                  ? t('status.all')
                  : s === 'EXCELLENT'
                    ? t('status.excellent')
                    : s === 'APPROVED'
                      ? t('status.strong')
                      : s === 'GOOD'
                        ? t('status.good')
                        : t('status.review')}
              </button>
            ))}
          </div>
        </section>

        {/* Column toggles + KP color legend — desktop only (table scrolls horizontally on mobile) */}
        <section className="mb-3 hidden sm:flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((c) => (
              <button
                key={c.key}
                onClick={() => toggleCol(c.key)}
                className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                  visibleCols.has(c.key)
                    ? 'bg-[var(--background-card)] text-[var(--foreground)] border-[var(--border)]'
                    : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] opacity-50'
                }`}
              >
                {t(COLUMN_LABEL_KEYS[c.key])}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="uppercase tracking-wider">{t('filters.kpColorLabel')}</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">≥100%</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-400">80–99%</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-400">&lt;80%</span>
            </span>
          </div>
        </section>

        {modelInfoOpen && <ModelExplainer onClose={() => setModelInfoOpen(false)} />}

        {/* Table */}
        <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
          <div className="overflow-auto rounded-xl max-h-[calc(100vh-180px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th
                    className="px-3 py-3 text-right w-12 cursor-help"
                    title={t('filters.rankTooltip')}
                  >
                    #
                  </th>
                  {COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                    <th
                      key={c.key}
                      title={c.hint}
                      className={`px-3 py-3 ${c.numeric ? 'text-right' : 'text-left'} ${
                        c.key !== 'status' ? 'cursor-pointer hover:text-[var(--foreground)]' : 'cursor-help'
                      }`}
                      onClick={() => c.key !== 'status' && handleSort(c.key as SortKey)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {t(COLUMN_LABEL_KEYS[c.key])}
                        {sortKey === c.key && <ArrowUpDown size={12} className="opacity-60" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.characterId}
                    className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors"
                  >
                    <td className="px-3 py-2 text-right text-[var(--text-muted)] tabular-nums">
                      {globalRankById.get(p.characterId)}
                    </td>
                    {COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${c.numeric ? 'text-right tabular-nums' : ''}`}
                      >
                        {renderCell(p, c.key, modelView, t)}
                      </td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={visibleCols.size + 1}
                      className="px-3 py-10 text-center text-[var(--text-muted)] text-sm"
                    >
                      {loadingDefault ? t('filters.loading') : t('filters.noPlayers')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Color a ratio: ≥1 green, 0.8–1 amber, <0.8 red. Same convention as KP target color. */
function ratioColor(r: number): string {
  if (r >= 1) return 'text-emerald-400';
  if (r >= 0.8) return 'text-amber-400';
  return 'text-red-400';
}

/** Render a value as `1.42×` colored by how it compares to the band model. */
function ratioCell(value: number, modelValue: number) {
  if (modelValue <= 0) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }
  const r = value / modelValue;
  return <span className={`font-medium ${ratioColor(r)}`}>{r.toFixed(2)}×</span>;
}

/** Full-screen explainer for the model-player view. Designed to be friendly to first-time users. */
function ModelExplainer({ onClose }: { onClose: () => void }) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 sm:p-8 border-b border-[var(--border)]">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Scoring Guide
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--foreground)]">
              How &quot;Vs Model Player&quot; works
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              The fair way to compare a 25M-power scout to an 87M-power whale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Step 1: bands */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center text-sm font-semibold">
                1
              </span>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Split players into 3 power bands
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4 ml-11">
              Whales and farms get judged differently. Each player lands in one of three groups
              based on their current power.
            </p>
            <div className="ml-11 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
                <div className="text-xs uppercase tracking-wider text-sky-400 font-semibold mb-1">
                  mT4 (micro)
                </div>
                <div className="text-2xl font-semibold text-[var(--foreground)]">&lt; 30M</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">scouts, climbers</div>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-1">
                  T4
                </div>
                <div className="text-2xl font-semibold text-[var(--foreground)]">30M – 42M</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">main fighters</div>
              </div>
              <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
                <div className="text-xs uppercase tracking-wider text-fuchsia-400 font-semibold mb-1">
                  T5
                </div>
                <div className="text-2xl font-semibold text-[var(--foreground)]">≥ 42M</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">whales</div>
              </div>
            </div>
            <p className="ml-11 mt-3 text-xs text-[var(--text-muted)]">
              The 42M cutoff comes from the power threshold in the scoring config. Change it
              there and the bands move with it.
            </p>
          </section>

          {/* Step 2: model player */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Pick the &quot;model player&quot; for each band
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4 ml-11">
              For each band, take the <b className="text-[var(--foreground)]">top third</b> of
              players by performance and grab the{' '}
              <b className="text-[var(--foreground)]">median</b> of their stats. That median
              becomes the typical &quot;strong&quot; player for that band — the bar everyone else
              gets compared to.
            </p>
            <div className="ml-11 rounded-lg border border-[var(--border)] bg-[var(--background)]/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Example: a strong T4 might look like
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[var(--text-muted)] text-xs">Power</div>
                  <div className="font-semibold text-[var(--foreground)]">~33M</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">Total KP</div>
                  <div className="font-semibold text-[var(--foreground)]">~125M</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">DKP</div>
                  <div className="font-semibold text-[var(--foreground)]">~67M</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">Honor</div>
                  <div className="font-semibold text-[var(--foreground)]">~72k</div>
                </div>
              </div>
            </div>
          </section>

          {/* Step 3: ratios */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-fuchsia-500/15 text-fuchsia-400 flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Show each player as a ratio
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4 ml-11">
              In this view every stat cell becomes{' '}
              <span className="text-[var(--foreground)] font-semibold">
                your value ÷ the band model
              </span>
              . A 1.42× means &quot;42% above the typical strong player in your band.&quot;
            </p>
            <div className="ml-11 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-emerald-400 font-semibold text-base">≥ 1.00×</div>
                  <div className="text-xs text-[var(--text-muted)]">at or above the model</div>
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
                <div>
                  <div className="text-amber-400 font-semibold text-base">0.80 – 0.99×</div>
                  <div className="text-xs text-[var(--text-muted)]">close, but a little short</div>
                </div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" />
                <div>
                  <div className="text-red-400 font-semibold text-base">&lt; 0.80×</div>
                  <div className="text-xs text-[var(--text-muted)]">well below the model</div>
                </div>
              </div>
            </div>
          </section>

          {/* Step 4: worked example */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500/15 text-yellow-400 flex items-center justify-center text-sm font-semibold">
                4
              </span>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Why this matters
              </h3>
            </div>
            <div className="ml-11 rounded-lg border border-[var(--border)] bg-[var(--background)]/40 p-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p className="mb-3">
                A <b className="text-[var(--foreground)]">28M-power scout</b> who deals 100M DKP
                looks weak next to an{' '}
                <b className="text-[var(--foreground)]">87M-power whale</b> doing 1B DKP. On the
                kingdom-wide score, the scout is buried.
              </p>
              <p className="mb-3">
                But compared to <i>other 28M scouts</i>, that player is{' '}
                <span className="text-emerald-400 font-semibold">2.7× the band model</span> —
                they&apos;re crushing it for their size class. This view surfaces them.
              </p>
              <div className="mt-4 flex items-center gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded bg-[var(--background)] text-[var(--text-muted)]">
                    Raw values
                  </span>
                  <span className="text-[var(--foreground)] font-semibold">99.62M DKP</span>
                  <span className="text-[var(--text-muted)]">→ looks small vs whales</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded bg-[var(--background)] text-[var(--text-muted)]">
                    Vs model
                  </span>
                  <span className="text-emerald-400 font-semibold">2.68×</span>
                  <span className="text-[var(--text-muted)]">→ top of their band</span>
                </div>
              </div>
            </div>
          </section>

          {/* Footer note */}
          <section className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-4 text-sm text-[var(--text-secondary)] flex items-start gap-3">
            <Info size={16} className="text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <b className="text-[var(--foreground)]">Heads up:</b> the status tier
              (EXCELLENT/STRONG/GOOD/REVIEW) still uses the kingdom-wide score so cutoffs stay
              consistent. The Score column shows both numbers in this view. Bands and the model
              auto-recalculate any time officers change weights or the formula.
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-[var(--border)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tailwind classes used to dim columns that aren't normalized in model view. */
const DIM = 'text-[var(--text-muted)]/60';

const BAND_BADGE: Record<Band, string> = {
  micro: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  t4: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  t5: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

function renderCell(
  p: ScoredPlayer,
  key: ColumnDef['key'],
  modelView: boolean,
  t: (k: string) => string,
) {
  switch (key) {
    case 'username':
      return <span className="text-[var(--foreground)] font-medium">{p.username}</span>;
    case 'power': {
      // Power keeps its raw value — the band IS the power category, so it doesn't get normalized.
      // Instead, the band membership is shown as a colored pill next to the value.
      const powerCls =
        p.band === 'micro'
          ? 'text-sky-400'
          : p.band === 't4'
            ? 'text-emerald-400'
            : 'text-fuchsia-400';
      return (
        <span className="inline-flex items-center gap-1.5 justify-end">
          <span className={`font-medium ${powerCls}`}>{fmtM(p.power)}</span>
          {modelView && (
            <span
              className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${BAND_BADGE[p.band]}`}
              title={`${BAND_LABELS[p.band]} band`}
            >
              {BAND_LABELS[p.band]}
            </span>
          )}
        </span>
      );
    }
    case 'totalKP': {
      if (modelView) return ratioCell(p.totalKP, p.modelStats.totalKP);
      const cls = ratioColor(p.kpRatio);
      return <span className={`font-medium ${cls}`}>{fmtM(p.totalKP)}</span>;
    }
    case 'targetKp':
      return (
        <span className={modelView ? DIM : ''}>
          {fmtM(p.targetKp)}{' '}
          <span className="text-[10px] text-[var(--text-muted)]">×{p.kpMultiplier.toFixed(1)}</span>
        </span>
      );
    case 't4Kills':
      return <span className={modelView ? DIM : ''}>{fmtM(p.t4Kills)}</span>;
    case 't5Kills':
      return <span className={modelView ? DIM : ''}>{fmtM(p.t5Kills)}</span>;
    case 't4Deaths':
      return <span className={modelView ? DIM : ''}>{fmtM(p.t4Deaths)}</span>;
    case 't5Deaths':
      return <span className={modelView ? DIM : ''}>{fmtM(p.t5Deaths)}</span>;
    case 'totalDeaths':
      return <span className={modelView ? DIM : ''}>{fmtM(p.t4Deaths + p.t5Deaths)}</span>;
    case 'dkp': {
      const v = p.dkp || p.computedDkp;
      return modelView ? ratioCell(v, p.modelStats.computedDkp) : fmtM(v);
    }
    case 'finalScore': {
      // The band score is what drives the status, so it's the headline number and is colored to
      // match the status pill. The kingdom-wide finalScore is shown as a muted secondary number.
      return (
        <span className={`font-semibold ${STATUS_TEXT[p.status]}`}>
          {fmtScore(p.bandScore)}
          <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
            (k {fmtScore(p.finalScore)})
          </span>
        </span>
      );
    }
    case 'status': {
      const label =
        p.status === 'EXCELLENT'
          ? t('status.excellent')
          : p.status === 'APPROVED'
            ? t('status.strong')
            : p.status === 'GOOD'
              ? t('status.good')
              : t('status.review');
      return (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[p.status]}`}
        >
          {label}
        </span>
      );
    }
    case 'honorPoints':
      return modelView ? ratioCell(p.honorPoints, p.modelStats.honorPoints) : fmt(p.honorPoints);
    default:
      return null;
  }
}

function OfficerBadge() {
  const t = useTranslations('dkp.officer');
  const { isAtLeast, role, login, logout, officerName, setOfficerName } = useWarRoomAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState(officerName ?? '');
  const [error, setError] = useState<string | null>(null);

  if (isAtLeast('officer')) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Lock size={12} /> {role.toUpperCase()}
          {officerName && <> • {officerName}</>}
        </span>
        <button
          onClick={logout}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
          title={t('signOut')}
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
      >
        <Lock size={12} /> {t('signIn')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('signInTitle')}</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]"
              >
                <X size={16} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const ok = login(password);
                if (!ok) {
                  setError(t('incorrectPassword'));
                  return;
                }
                if (name.trim()) setOfficerName(name.trim());
                setPassword('');
                setError(null);
                setOpen(false);
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('yourName')}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                className="w-full px-3 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] transition-colors"
              >
                {t('submit')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function UploadPanel({
  onUploaded,
  onReset,
  currentDataset,
}: {
  onUploaded: (d: DkpDataset) => Promise<void>;
  onReset: () => void | Promise<void>;
  currentDataset: DkpDataset | null;
}) {
  const t = useTranslations('dkp.upload');
  const statsRef = useRef<HTMLInputElement>(null);
  const honorRef = useRef<HTMLInputElement>(null);
  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [honorFile, setHonorFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleProcess = async () => {
    setError(null);
    setInfo(null);
    if (!statsFile) {
      setError(t('errorRequired'));
      return;
    }
    setBusy(true);
    try {
      const stats = await parseStatsFile(statsFile);
      const honor = honorFile ? await parseHonorFile(honorFile) : [];
      const players = mergeIntoPlayers(stats, honor);
      const matched = honor.length
        ? players.filter((p) => p.honorPoints > 0).length
        : 0;
      await onUploaded({
        uploadedAt: new Date().toISOString(),
        uploadedBy: null,
        statsFileName: statsFile.name,
        honorFileName: honorFile?.name ?? null,
        players,
      });
      setInfo(
        honor.length
          ? t('loadedInfoFull', { count: players.length, matched, total: honor.length })
          : t('loadedInfo', { count: players.length }),
      );
      setStatsFile(null);
      setHonorFile(null);
      if (statsRef.current) statsRef.current.value = '';
      if (honorRef.current) honorRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorParse'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Upload size={14} /> {t('heading')}
        </h2>
        {currentDataset?.uploadedAt && (
          <button
            onClick={onReset}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
          >
            {t('resetToDefault')}
          </button>
        )}
      </div>
      <div className="mb-4 space-y-2 text-xs text-[var(--text-muted)]">
        <p>{t('noticeShared')}</p>
        <p>
          <span className="font-semibold text-amber-400">{t('noticeDateRangeBold')}</span>{' '}
          {t('noticeDateRange')}
        </p>
        <p>
          <span className="font-medium text-[var(--text-secondary)]">
            {t('noticeFilesKingdomLabel')}
          </span>{' '}
          {t('noticeFilesKingdom')} <em>{t('noticeFilesKingdomEm')}</em>.{' '}
          <span className="font-medium text-[var(--text-secondary)]">
            {t('noticeFilesHonorLabel')}
          </span>{' '}
          {t('noticeFilesHonor')}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileInput
          label={t('kingdomFile')}
          inputRef={statsRef}
          file={statsFile}
          onChange={setStatsFile}
          accept=".xlsx"
        />
        <FileInput
          label={t('honorFile')}
          inputRef={honorRef}
          file={honorFile}
          onChange={setHonorFile}
          accept=".xlsx"
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleProcess}
          disabled={!statsFile || busy}
          className="px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? t('processing') : t('process')}
        </button>
        {info && <span className="text-xs text-emerald-400">{info}</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </section>
  );
}

function FileInput({
  label,
  inputRef,
  file,
  onChange,
  accept,
}: {
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  onChange: (f: File | null) => void;
  accept: string;
}) {
  const t = useTranslations('dkp.upload');
  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
        >
          {t('chooseFile')}
        </button>
        <span className="text-xs text-[var(--text-muted)] truncate">
          {file ? file.name : t('noFile')}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'excellent' | 'approved' | 'good' | 'review';
}) {
  // Match the status pill palette so the summary cards visually pair with the table.
  const toneClass =
    tone === 'excellent'
      ? 'text-violet-400'
      : tone === 'approved'
        ? 'text-cyan-400'
        : tone === 'good'
          ? 'text-indigo-400'
          : tone === 'review'
            ? 'text-rose-400'
            : 'text-[var(--foreground)]';
  return (
    <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 truncate">
        {label}
      </div>
      <div className={`text-lg sm:text-xl font-semibold ${toneClass} tabular-nums`}>{value}</div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Hover/focus tooltip rendered into a portal so it can't be clipped by overflow ancestors. */
function Tooltip({
  content,
  children,
  className = '',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean } | null>(
    null,
  );
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const tipHeight = tooltipRef.current?.offsetHeight ?? 60;
    const placeAbove = rect.top - tipHeight - margin > 0;
    setCoords({
      top: placeAbove ? rect.top - margin : rect.bottom + margin,
      left: rect.left + rect.width / 2,
      placeAbove,
    });
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ${className}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && coords && typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: coords.placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
            className="pointer-events-none z-[9999] w-64 max-w-[80vw] px-2.5 py-1.5 rounded-md bg-[var(--background-card)] border border-[var(--border)] shadow-xl text-[11px] font-normal leading-snug text-[var(--text-secondary)] normal-case tracking-normal"
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}

/** A consistent card wrapper for each config section (formula / weights / cutoffs). */
function ConfigCard({
  title,
  hint,
  rightSlot,
  children,
}: {
  title: string;
  hint: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
            {title}
          </span>
          <Tooltip content={hint}>
            <span className="cursor-help text-[var(--text-muted)] hover:text-[var(--foreground)]">
              <Info size={11} />
            </span>
          </Tooltip>
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

/** Decimal coefficient input with tooltip — used for the expected baseline multipliers. */
function BaselineInput({
  label,
  hint,
  value,
  step,
  decimals,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  decimals: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value.toFixed(decimals));
  useEffect(() => {
    setText(value.toFixed(decimals));
  }, [value, decimals]);
  return (
    <div>
      <Tooltip content={hint}>
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)] block mb-1.5 cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
          {label}
        </label>
      </Tooltip>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text);
          if (Number.isNaN(n) || n < 0) {
            setText(value.toFixed(decimals));
            return;
          }
          onChange(n);
          setText(n.toFixed(decimals));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-full px-2.5 py-2 rounded bg-[var(--background)] border border-[var(--border)] text-base tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** Compact one-liner summary of the active config for the collapsed panel. */
function ConfigSummaryLine({ config }: { config: Config }) {
  // Show the T5 band as the headline (whales drive the kingdom-wide picture).
  const f = config.formulaT5;
  const cuts = config.cutoffsT5;
  return (
    <span>
      T5: T4K {f.t4Kill} • T5K {f.t5Kill} • T4D {f.t4Death} • T5D {f.t5Death} • RSS {f.rss} • H{' '}
      {f.helps} • Hnr {f.honor}
      {' • '}
      KP ×{config.kpTargetMt4.toFixed(1)}/×{config.kpTargetT4.toFixed(1)}/×
      {config.kpTargetT5.toFixed(1)} @ {(config.mt4T4Threshold / 1_000_000).toFixed(0)}M /{' '}
      {(config.t4T5Threshold / 1_000_000).toFixed(0)}M
      {' • '}
      <span className="text-amber-400/80">≥{Math.round(cuts.excellent)}</span>{' '}
      <span className="text-emerald-400/80">≥{Math.round(cuts.approved)}</span>{' '}
      <span className="text-sky-400/80">≥{Math.round(cuts.good)}</span>
    </span>
  );
}

/** Power input shown/edited in millions (e.g. "40" → 40,000,000). */
function PowerInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const toM = (n: number) => (n / 1_000_000).toString();
  const [text, setText] = useState(toM(value));
  useEffect(() => {
    setText(toM(value));
  }, [value]);
  return (
    <div className="inline-flex items-center rounded-lg bg-[var(--background)] border border-[var(--border)] focus-within:border-[var(--foreground)]/30 overflow-hidden">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={1}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text);
          if (Number.isNaN(n) || n < 0) {
            setText(toM(value));
            return;
          }
          onChange(Math.round(n * 1_000_000));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-16 px-2 py-1.5 text-sm text-right tabular-nums text-[var(--foreground)] bg-transparent focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <span className="px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)] border-l border-[var(--border)]">
        M
      </span>
    </div>
  );
}

const FORMULA_META: Record<FormulaKey, { label: string; hint: string; color: string }> = {
  t4Kill: {
    label: 'T4 Kills',
    hint: 'Tier 4 kill points. Set to 0 if you don\'t want this band judged on T4 kills.',
    color: 'bg-violet-400',
  },
  t5Kill: {
    label: 'T5 Kills',
    hint: 'Tier 5 kill points. Usually 0 for mT4 since smaller accounts can\'t earn these.',
    color: 'bg-violet-600',
  },
  t4Death: {
    label: 'T4 Deaths',
    hint: 'Tier 4 deaths (sacrifice). Rewards taking hits, not just dealing them.',
    color: 'bg-rose-400',
  },
  t5Death: {
    label: 'T5 Deaths',
    hint: 'Tier 5 deaths. Usually 0 for mT4 since smaller accounts can\'t field T5 troops.',
    color: 'bg-rose-600',
  },
  rss: {
    label: 'RSS',
    hint: 'Resources gathered from the kingdom map. Rewards active gathering.',
    color: 'bg-amber-500',
  },
  helps: {
    label: 'Helps',
    hint: 'Alliance helps given. Rewards being active in the alliance.',
    color: 'bg-sky-500',
  },
  honor: {
    label: 'Honor',
    hint: 'Honor points earned (PvP, events). From the Statmaster honor rankings file.',
    color: 'bg-emerald-500',
  },
};

/** Single editable row for one component of a band's flat formula. */
function FormulaRow({
  formulaKey,
  value,
  onChange,
  disabled = false,
}: {
  formulaKey: FormulaKey;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const meta = FORMULA_META[formulaKey];
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => {
    setText(String(Math.round(value)));
  }, [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) {
      setText(String(Math.round(value)));
      return;
    }
    const c = Math.round(clamp(n, 0, 100));
    onChange(c);
    setText(String(c));
  };
  const isOff = value === 0;
  return (
    <div
      className={`flex items-center gap-3 py-1.5 ${disabled ? 'opacity-70' : ''} ${isOff ? 'opacity-40' : ''}`}
    >
      <Tooltip content={meta.hint} className="w-24 sm:w-28 flex-shrink-0">
        <span className="flex items-center gap-2 cursor-help">
          <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
          <span className="text-xs font-medium text-[var(--foreground)] underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
            {meta.label}
          </span>
        </span>
      </Tooltip>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value)}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1 accent-[#4318ff] disabled:cursor-not-allowed h-2"
      />
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-14 px-1.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** One full unified-formula card for a band: 7 sliders + effective-share breakdown. */
/** One full per-band column: header strip + KP target + score formula + status cutoffs.
 *  This is the visual unit officers actually think in — everything that affects mT4/T4/T5
 *  lives in one column, color-coded to its band. */
function BandColumn({
  band,
  formula,
  cutoffs,
  kpTarget,
  powerRangeLabel,
  examplePower,
  onFormulaChange,
  onCutoffChange,
  onKpTargetChange,
  disabled = false,
}: {
  band: Band;
  formula: BandFormula;
  cutoffs: CutoffSet;
  kpTarget: number;
  powerRangeLabel: string;
  examplePower: number;
  onFormulaChange: (key: FormulaKey, value: number) => void;
  onCutoffChange: (key: keyof CutoffSet, value: number) => void;
  onKpTargetChange: (v: number) => void;
  disabled?: boolean;
}) {
  // Color palette per band — used on the header strip and accents.
  const palette: Record<Band, { headerBg: string; border: string; text: string; ring: string }> = {
    micro: {
      headerBg: 'bg-sky-500/10',
      border: 'border-sky-500/30',
      text: 'text-sky-400',
      ring: 'ring-sky-500/20',
    },
    t4: {
      headerBg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      ring: 'ring-emerald-500/20',
    },
    t5: {
      headerBg: 'bg-fuchsia-500/10',
      border: 'border-fuchsia-500/30',
      text: 'text-fuchsia-400',
      ring: 'ring-fuchsia-500/20',
    },
  };
  const c = palette[band];
  const total = FORMULA_KEYS.reduce((s, k) => s + formula[k], 0);
  return (
    <div
      className={`rounded-xl border ${c.border} bg-[var(--background-card)] overflow-hidden flex flex-col`}
    >
      {/* Band header strip */}
      <div className={`${c.headerBg} px-4 py-3 border-b ${c.border}`}>
        <div className="flex items-baseline justify-between gap-2">
          <div className={`text-base font-semibold ${c.text}`}>{BAND_LABELS[band]}</div>
          <div className="text-[11px] text-[var(--text-muted)] tabular-nums">{powerRangeLabel}</div>
        </div>
      </div>

      {/* KP Target section */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]/60">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
          KP Target
        </div>
        <div className="flex items-center gap-3">
          <BaselineInput
            label="× power"
            hint={`Target KP for this band = power × this multiplier. Example: a ${(examplePower / 1_000_000).toFixed(0)}M player should hit ${((examplePower * kpTarget) / 1_000_000).toFixed(0)}M KP.`}
            value={kpTarget}
            step={0.5}
            decimals={1}
            disabled={disabled}
            onChange={onKpTargetChange}
          />
          <div className="flex-1 text-xs text-[var(--text-muted)] leading-snug">
            {(examplePower / 1_000_000).toFixed(0)}M player →{' '}
            <span className={`font-medium ${c.text}`}>
              {((examplePower * kpTarget) / 1_000_000).toFixed(0)}M KP
            </span>
          </div>
        </div>
      </div>

      {/* Score formula section */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]/60">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Score Formula
          </div>
          {total > 0 && (
            <div className="text-[10px] text-[var(--text-muted)]">
              {FORMULA_KEYS.filter((k) => formula[k] > 0).length} active
            </div>
          )}
        </div>
        <div className="divide-y divide-[var(--border)]/40">
          {FORMULA_KEYS.map((k) => (
            <FormulaRow
              key={k}
              formulaKey={k}
              value={formula[k]}
              disabled={disabled}
              onChange={(v) => onFormulaChange(k, v)}
            />
          ))}
        </div>
        {total > 0 && (
          <div className="mt-2 pt-2 border-t border-[var(--border)]/40 text-[10px] text-[var(--text-muted)] flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="uppercase tracking-wider">Share:</span>
            {FORMULA_KEYS.map((k) => {
              if (formula[k] <= 0) return null;
              return (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${FORMULA_META[k].color}`} />
                  <span>
                    {FORMULA_META[k].label} {Math.round((formula[k] / total) * 100)}%
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Status cutoffs section */}
      <div className="px-4 pt-4 pb-4">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Status Cutoffs
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 px-3 divide-y divide-[var(--border)]/40">
          <CutoffRowSimple
            cutoffKey="excellent"
            value={cutoffs.excellent}
            disabled={disabled}
            onChange={(v) => onCutoffChange('excellent', v)}
          />
          <CutoffRowSimple
            cutoffKey="approved"
            value={cutoffs.approved}
            disabled={disabled}
            onChange={(v) => onCutoffChange('approved', v)}
          />
          <CutoffRowSimple
            cutoffKey="good"
            value={cutoffs.good}
            disabled={disabled}
            onChange={(v) => onCutoffChange('good', v)}
          />
          <div className="flex items-center gap-3 py-1.5">
            <span
              className={`inline-flex items-center justify-center w-20 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES.REJECTED} flex-shrink-0`}
            >
              {STATUS_LABELS.REJECTED}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] flex-1">
              below {Math.round(cutoffs.good)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const CUTOFF_HINTS: Record<keyof CutoffSet, string> = {
  excellent: 'Top tier — players whose band score is at or above this are marked EXCELLENT.',
  approved: 'Players hitting at least this band score are STRONG (clearly pulling weight).',
  good: 'Players hitting at least this are GOOD. Below this they fall into REVIEW (if in the top-power pool).',
};

const CUTOFF_STATUS: Record<keyof CutoffSet, Status> = {
  excellent: 'EXCELLENT',
  approved: 'APPROVED',
  good: 'GOOD',
};

/** Single editable cutoff row (badge + slider + number). */
function CutoffRowSimple({
  cutoffKey,
  value,
  onChange,
  disabled = false,
}: {
  cutoffKey: keyof CutoffSet;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const status = CUTOFF_STATUS[cutoffKey];
  const toStr = (v: number) => String(Math.round(v));
  const [text, setText] = useState(toStr(value));
  useEffect(() => {
    setText(toStr(value));
  }, [value]);
  const commit = () => {
    const n = parseFloat(text);
    if (Number.isNaN(n)) {
      setText(toStr(value));
      return;
    }
    const v = clamp(Math.round(n), 0, 100);
    onChange(v);
    setText(toStr(v));
  };
  const accentClass =
    status === 'EXCELLENT'
      ? 'accent-violet-400'
      : status === 'APPROVED'
        ? 'accent-cyan-400'
        : 'accent-indigo-400';
  return (
    <div className={`flex items-center gap-3 py-1.5 ${disabled ? 'opacity-70' : ''}`}>
      <Tooltip content={CUTOFF_HINTS[cutoffKey]} className="flex-shrink-0">
        <span
          className={`inline-flex items-center justify-center w-20 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${STATUS_STYLES[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </Tooltip>
      <span className="text-xs text-[var(--text-muted)] hidden sm:inline">≥</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value)}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={`flex-1 ${accentClass} disabled:cursor-not-allowed h-2`}
      />
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-14 px-1.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
      />
    </div>
  );
}

