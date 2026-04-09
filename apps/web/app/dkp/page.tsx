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

interface WeightSet {
  dkp: number;
  rss: number;
  helps: number;
  honor: number;
}

interface DkpFormula {
  t4Kill: number;
  t5Kill: number;
  t4Death: number;
  t5Death: number;
}

interface Config {
  // When split is true, each power band gets its own weight set. When false, weightsT5 is used
  // for everyone (one unified weighting).
  split: boolean;
  // Power band boundaries. mT4 = power < mt4T4Threshold, T4 = mt4T4Threshold..t4T5Threshold, T5 ≥ t4T5Threshold.
  mt4T4Threshold: number;
  t4T5Threshold: number;
  weightsMt4: WeightSet;
  weightsT4: WeightSet;
  weightsT5: WeightSet;
  dkpFormula: DkpFormula;
  meta: {
    dkpDivisor: number;
    rssMultiplier: number;
    helpsMultiplier: number;
    honorMultiplier: number;
  };
  // KP target multipliers per band — actual KP is compared against power × this number.
  kpTargetMt4: number;
  kpTargetT4: number;
  kpTargetT5: number;
  statusThresholds: { excellent: number; approved: number; good: number };
}

// Weights are relative integers in [0, 100]. They do NOT need to sum to anything;
// the final score divides by the sum of active weights. Larger numbers just dominate.
const DEFAULT_WEIGHTS: WeightSet = { dkp: 80, rss: 5, helps: 5, honor: 10 };
const DEFAULT_DKP_FORMULA: DkpFormula = { t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24 };

const DEFAULT_CONFIG: Config = {
  split: false,
  mt4T4Threshold: 30_000_000,
  t4T5Threshold: 42_000_000,
  weightsMt4: { ...DEFAULT_WEIGHTS },
  weightsT4: { ...DEFAULT_WEIGHTS },
  weightsT5: { ...DEFAULT_WEIGHTS },
  dkpFormula: { ...DEFAULT_DKP_FORMULA },
  meta: {
    dkpDivisor: 4,
    rssMultiplier: 3.0,
    helpsMultiplier: 0.0003,
    honorMultiplier: 0.001,
  },
  kpTargetMt4: 2,
  kpTargetT4: 3,
  kpTargetT5: 10,
  // Scores are now 0–100 (each sub-score = value ÷ kingdom max × 100, then weighted-averaged).
  // Cutoffs are stored on the same 0–100 scale.
  statusThresholds: { excellent: 60, approved: 35, good: 15 },
};

/** Migrate legacy 0–1 weight sets to the new 0–100 integer scale. */
function migrateWeights(w: Partial<WeightSet> | undefined): Partial<WeightSet> {
  if (!w) return {};
  const values = Object.values(w).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return w;
  const max = Math.max(...values);
  if (max > 0 && max <= 1) {
    // Legacy decimal scale — rescale to integers in [0, 100].
    const out: Partial<WeightSet> = {};
    for (const [k, v] of Object.entries(w)) {
      if (typeof v === 'number') (out as Record<string, number>)[k] = Math.round(v * 100);
    }
    return out;
  }
  return w;
}

/** Migrate legacy cutoff thresholds (stored as 0–3 ratios) to the new 0–100 scale. */
function migrateThresholds(
  t: Partial<Config['statusThresholds']> | undefined,
): Partial<Config['statusThresholds']> {
  if (!t) return {};
  const vals = Object.values(t).filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return t;
  // Old cutoffs lived in [0, 3]. If everything is below 3, assume legacy and rescale ×100/3 → 0–100.
  if (Math.max(...vals) <= 3) {
    const out: Partial<Config['statusThresholds']> = {};
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === 'number') (out as Record<string, number>)[k] = Math.round((v / 3) * 100);
    }
    return out;
  }
  return t;
}

/** Merge a partial remote config onto a base, preserving nested defaults.
 *  Also migrates the legacy 2-band schema (weightsLow/High, weightSplitThreshold, kpTargetLow/High)
 *  into the new 3-band schema (weightsMt4/T4/T5, mt4T4Threshold, t4T5Threshold, kpTargetMt4/T4/T5).
 */
function mergeConfig(base: Config, partial: Partial<Config> | null | undefined): Config {
  if (!partial) return base;
  // Some legacy fields aren't in the current Config type, so cast to a permissive shape.
  const legacy = partial as Partial<Config> & {
    weightsLow?: Partial<WeightSet>;
    weightsHigh?: Partial<WeightSet>;
    weightSplitThreshold?: number;
    kpTargetLow?: number;
    kpTargetHigh?: number;
  };

  // Bands: prefer new fields, fall back to legacy.
  const t4T5Threshold = partial.t4T5Threshold ?? legacy.weightSplitThreshold ?? base.t4T5Threshold;
  const mt4T4Threshold = partial.mt4T4Threshold ?? base.mt4T4Threshold;

  // Weights: use new keys if present; otherwise migrate the legacy low/high pair.
  const legacyLow = migrateWeights(legacy.weightsLow);
  const legacyHigh = migrateWeights(legacy.weightsHigh);
  const weightsMt4 = { ...base.weightsMt4, ...legacyLow, ...(migrateWeights(partial.weightsMt4)) };
  const weightsT4 = { ...base.weightsT4, ...legacyLow, ...(migrateWeights(partial.weightsT4)) };
  const weightsT5 = { ...base.weightsT5, ...legacyHigh, ...(migrateWeights(partial.weightsT5)) };

  // KP target multipliers per band: prefer new keys, fall back to legacy low/high.
  const kpTargetMt4 = partial.kpTargetMt4 ?? legacy.kpTargetLow ?? base.kpTargetMt4;
  const kpTargetT4 = partial.kpTargetT4 ?? legacy.kpTargetLow ?? base.kpTargetT4;
  const kpTargetT5 = partial.kpTargetT5 ?? legacy.kpTargetHigh ?? base.kpTargetT5;

  return {
    ...base,
    ...partial,
    mt4T4Threshold,
    t4T5Threshold,
    weightsMt4,
    weightsT4,
    weightsT5,
    kpTargetMt4,
    kpTargetT4,
    kpTargetT5,
    dkpFormula: { ...base.dkpFormula, ...(partial.dkpFormula ?? {}) },
    statusThresholds: { ...base.statusThresholds, ...migrateThresholds(partial.statusThresholds) },
    meta: { ...base.meta, ...(partial.meta ?? {}) },
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
  const { statusThresholds, dkpFormula } = config;

  // 1. Compute DKP for every player and assign a band.
  const enriched = players.map((p) => {
    const computedDkp =
      p.t4Kills * dkpFormula.t4Kill +
      p.t5Kills * dkpFormula.t5Kill +
      p.t4Deaths * dkpFormula.t4Death +
      p.t5Deaths * dkpFormula.t5Death;
    return {
      ...p,
      computedDkp,
      band: bandOf(p.power, config.mt4T4Threshold, config.t4T5Threshold),
    };
  });

  // 2. Kingdom-wide maxes (for the standard view).
  const maxDkp = Math.max(0, ...enriched.map((p) => p.computedDkp));
  const maxRss = Math.max(0, ...enriched.map((p) => p.rssGathered));
  const maxHelps = Math.max(0, ...enriched.map((p) => p.allianceHelps));
  const maxHonor = Math.max(0, ...enriched.map((p) => p.honorPoints));

  // 3. Per-band maxes (for the model-player view).
  const bandMax = (band: Band) => {
    const inBand = enriched.filter((p) => p.band === band);
    return {
      dkp: Math.max(0, ...inBand.map((p) => p.computedDkp)),
      rss: Math.max(0, ...inBand.map((p) => p.rssGathered)),
      helps: Math.max(0, ...inBand.map((p) => p.allianceHelps)),
      honor: Math.max(0, ...inBand.map((p) => p.honorPoints)),
    };
  };
  const maxes: Record<Band, ReturnType<typeof bandMax>> = {
    micro: bandMax('micro'),
    t4: bandMax('t4'),
    t5: bandMax('t5'),
  };

  const weighted = (
    sDkp: number,
    sRss: number,
    sHelps: number,
    sHonor: number,
    w: WeightSet,
  ) => {
    let num = 0;
    let den = 0;
    const parts: [number, number][] = [
      [sDkp, w.dkp],
      [sRss, w.rss],
      [sHelps, w.helps],
      [sHonor, w.honor],
    ];
    for (const [s, ww] of parts) {
      if (ww > 0) {
        num += s * ww;
        den += ww;
      }
    }
    return den > 0 ? num / den : 0;
  };

  // 4. First pass: compute kingdom-wide and per-band scores so we can build the model afterward.
  const firstPass = enriched.map((p) => {
    // When split is on, each band gets its own weight set. When off, T5 weights apply to everyone.
    const weights = config.split
      ? p.band === 'micro'
        ? config.weightsMt4
        : p.band === 't4'
          ? config.weightsT4
          : config.weightsT5
      : config.weightsT5;

    // Kingdom-wide sub-scores.
    const scoreDkp = safeDiv(p.computedDkp, maxDkp) * 100;
    const scoreRss = safeDiv(p.rssGathered, maxRss) * 100;
    const scoreHelps = safeDiv(p.allianceHelps, maxHelps) * 100;
    const scoreHonor = safeDiv(p.honorPoints, maxHonor) * 100;
    const finalScore = weighted(scoreDkp, scoreRss, scoreHelps, scoreHonor, weights);

    // Per-band sub-scores (used to find each band's top tertile = the model cohort).
    const m = maxes[p.band];
    const bDkp = safeDiv(p.computedDkp, m.dkp) * 100;
    const bRss = safeDiv(p.rssGathered, m.rss) * 100;
    const bHelps = safeDiv(p.allianceHelps, m.helps) * 100;
    const bHonor = safeDiv(p.honorPoints, m.honor) * 100;
    const bandScore = weighted(bDkp, bRss, bHelps, bHonor, weights);

    return { ...p, scoreDkp, scoreRss, scoreHelps, scoreHonor, finalScore, bandScore, weights };
  });

  // 5. Build the per-band model player from the top tertile of each band.
  const models = computeModels(firstPass);

  // 6. Final pass: attach KP target, model, and status.
  return firstPass.map((p) => {
    const kpMultiplier =
      p.band === 'micro'
        ? config.kpTargetMt4
        : p.band === 't4'
          ? config.kpTargetT4
          : config.kpTargetT5;
    const targetKp = p.power * kpMultiplier;
    const kpRatio = safeDiv(p.totalKP, targetKp);

    let status: Status;
    if (p.finalScore >= statusThresholds.excellent) status = 'EXCELLENT';
    else if (p.finalScore >= statusThresholds.approved) status = 'APPROVED';
    else if (p.finalScore >= statusThresholds.good) status = 'GOOD';
    else status = 'REJECTED';

    return {
      ...p,
      computedDkp: p.computedDkp,
      targetKp,
      kpMultiplier,
      kpRatio,
      totalDeaths: p.t4Deaths + p.t5Deaths,
      scoreDkp: p.scoreDkp,
      scoreRss: p.scoreRss,
      scoreHelps: p.scoreHelps,
      scoreHonor: p.scoreHonor,
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

const STATUS_STYLES: Record<Status, string> = {
  EXCELLENT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  GOOD: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
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
      await saveSharedConfig(config);
      setPublishedConfig(config);
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

  const setWeight = (
    band: 'weightsMt4' | 'weightsT4' | 'weightsT5',
    key: keyof WeightSet,
    value: number,
  ) => {
    setConfig((c) => ({ ...c, [band]: { ...c[band], [key]: value } }));
  };
  const setThreshold = (key: keyof Config['statusThresholds'], value: number) => {
    setConfig((c) => ({ ...c, statusThresholds: { ...c.statusThresholds, [key]: value } }));
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
          <SummaryCard label={t('summary.excellent')} value={fmt(summary.counts.EXCELLENT)} tone="amber" />
          <SummaryCard label={t('summary.strong')} value={fmt(summary.counts.APPROVED)} tone="emerald" />
          <SummaryCard label={t('summary.good')} value={fmt(summary.counts.GOOD)} tone="sky" />
          <SummaryCard label={t('summary.review')} value={fmt(summary.counts.REJECTED)} tone="red" />
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
                <label
                  title={t('config.splitToggleHint')}
                  className={`flex items-center gap-2 text-xs text-[var(--text-muted)] select-none ${isOfficer ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <input
                    type="checkbox"
                    checked={config.split}
                    disabled={!isOfficer}
                    onChange={(e) => setConfig((c) => ({ ...c, split: e.target.checked }))}
                    className="accent-[#4318ff]"
                  />
                  {t('config.splitToggleLabel')}
                </label>
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

              {/* 2 columns: small cards stacked on the left, Weights alone on the right.
                  Matches typical heights so there are no awkward gaps. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="space-y-4">
                {/* DKP Formula card */}
                <ConfigCard
                  title={t('dkpFormulaCard.title')}
                  hint="How the raw DKP number is built from each player's T4/T5 kills and deaths. Higher coefficients reward that activity more."
                >
                  <div className="grid grid-cols-2 gap-3">
                    {(['t4Kill', 't5Kill', 't4Death', 't5Death'] as const).map((key) => (
                      <FormulaCoef
                        key={key}
                        label={FORMULA_LABELS[key].label}
                        hint={FORMULA_LABELS[key].hint}
                        value={config.dkpFormula[key]}
                        disabled={!isOfficer}
                        onChange={(v) =>
                          setConfig((c) => ({
                            ...c,
                            dkpFormula: { ...c.dkpFormula, [key]: v },
                          }))
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-3 text-[10px] text-[var(--text-muted)] tabular-nums leading-relaxed">
                    DKP = T4K×{config.dkpFormula.t4Kill} + T5K×{config.dkpFormula.t5Kill} +
                    T4D×{config.dkpFormula.t4Death} + T5D×{config.dkpFormula.t5Death}
                  </div>
                </ConfigCard>

                {/* Expected KP card — KP target = power × multiplier (low/high tier) */}
                <ConfigCard
                  title={t('expectedKpCard.title')}
                  hint="The KP each player is expected to produce based on their power. Smaller accounts use the low multiplier, larger accounts the high one. KP performance (actual KP ÷ target KP) feeds into the Score Weights as the 'KP' weight."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <BaselineInput
                      label="mT4 × power"
                      hint={`For mT4 accounts (under ${(config.mt4T4Threshold / 1_000_000).toFixed(0)}M power), target KP = power × this.`}
                      value={config.kpTargetMt4}
                      step={0.5}
                      decimals={1}
                      disabled={!isOfficer}
                      onChange={(v) => setConfig((c) => ({ ...c, kpTargetMt4: v }))}
                    />
                    <BaselineInput
                      label="T4 × power"
                      hint={`For T4 accounts (${(config.mt4T4Threshold / 1_000_000).toFixed(0)}M – ${(config.t4T5Threshold / 1_000_000).toFixed(0)}M power), target KP = power × this.`}
                      value={config.kpTargetT4}
                      step={0.5}
                      decimals={1}
                      disabled={!isOfficer}
                      onChange={(v) => setConfig((c) => ({ ...c, kpTargetT4: v }))}
                    />
                    <BaselineInput
                      label="T5 × power"
                      hint={`For T5 accounts (≥ ${(config.t4T5Threshold / 1_000_000).toFixed(0)}M power), target KP = power × this.`}
                      value={config.kpTargetT5}
                      step={0.5}
                      decimals={1}
                      disabled={!isOfficer}
                      onChange={(v) => setConfig((c) => ({ ...c, kpTargetT5: v }))}
                    />
                  </div>
                  {(() => {
                    // Three example rows: middle of each band's range.
                    // mT4 mid = mt4T4Threshold/2, T4 mid = avg(mt4T4, t4T5), T5 mid = t4T5 * 1.5.
                    const round5M = (n: number) =>
                      Math.max(5_000_000, Math.round(n / 5_000_000) * 5_000_000);
                    const mt4Power = round5M(config.mt4T4Threshold / 2);
                    const t4Power = round5M((config.mt4T4Threshold + config.t4T5Threshold) / 2);
                    const t5Power = round5M(config.t4T5Threshold * 1.5);
                    const rows: { power: number; band: Band; mult: number }[] = [
                      { power: mt4Power, band: 'micro', mult: config.kpTargetMt4 },
                      { power: t4Power, band: 't4', mult: config.kpTargetT4 },
                      { power: t5Power, band: 't5', mult: config.kpTargetT5 },
                    ];
                    const colorByBand: Record<Band, string> = {
                      micro: 'text-sky-400',
                      t4: 'text-emerald-400',
                      t5: 'text-fuchsia-400',
                    };
                    return (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 overflow-hidden">
                        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]/50">
                          Examples
                        </div>
                        <table className="w-full text-sm tabular-nums">
                          <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                            <tr>
                              <th className="text-left px-3 py-2">Power</th>
                              <th className="text-right px-3 py-2">Multiplier</th>
                              <th className="text-right px-3 py-2">Target KP</th>
                            </tr>
                          </thead>
                          <tbody className="text-[var(--text-secondary)]">
                            {rows.map((r) => (
                              <tr key={r.band} className="border-t border-[var(--border)]/50">
                                <td className="text-left px-3 py-2 font-medium text-[var(--foreground)]">
                                  {(r.power / 1_000_000).toFixed(0)}M{' '}
                                  <span className={`text-[10px] font-normal ${colorByBand[r.band]}`}>
                                    ({BAND_LABELS[r.band]})
                                  </span>
                                </td>
                                <td className={`text-right px-3 py-2 ${colorByBand[r.band]}`}>
                                  ×{r.mult.toFixed(1)}
                                </td>
                                <td className="text-right px-3 py-2 font-medium text-[var(--foreground)]">
                                  {fmtCompact(r.power * r.mult)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </ConfigCard>

                {/* Reading-the-table reference (also balances column heights) */}
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
                          <span className="text-[var(--foreground)] font-medium">KP</span> —
                          actual total kill points
                        </li>
                        <li>
                          <span className="text-[var(--foreground)] font-medium">Target KP</span>{' '}
                          — power × multiplier (×3 small / ×10 large by default)
                        </li>
                        <li>
                          <span className="text-[var(--foreground)] font-medium">DKP</span> —
                          weighted kills + deaths from the formula
                        </li>
                        <li>
                          <span className="text-[var(--foreground)] font-medium">Score</span> —
                          0–100, weighted blend of how this player ranks vs the kingdom max in
                          each category
                        </li>
                        <li>
                          <span className="text-[var(--foreground)] font-medium">Status</span> —
                          tier from the cutoffs above
                        </li>
                      </ul>
                    </div>
                  </div>
                </ConfigCard>

                </div>

                {/* Right column: Score Weights + Status Cutoffs stacked */}
                <div className="space-y-4">
                <ConfigCard
                  title={t('weightsCard.title')}
                  hint="How much each sub-score contributes to the final number. Values are relative — the badge on each band shows what share each weight effectively gets."
                >
                  <div className="space-y-3">
                    {config.split ? (
                      <>
                        <WeightBand
                          title="mT4"
                          subtitle={`Under ${(config.mt4T4Threshold / 1_000_000).toFixed(0)}M power`}
                          weights={config.weightsMt4}
                          disabled={!isOfficer}
                          onChange={(k, v) => setWeight('weightsMt4', k, v)}
                        />
                        <WeightBand
                          title="T4"
                          subtitle={`${(config.mt4T4Threshold / 1_000_000).toFixed(0)}M – ${(config.t4T5Threshold / 1_000_000).toFixed(0)}M power`}
                          weights={config.weightsT4}
                          disabled={!isOfficer}
                          onChange={(k, v) => setWeight('weightsT4', k, v)}
                        />
                        <WeightBand
                          title="T5"
                          subtitle={`At or above ${(config.t4T5Threshold / 1_000_000).toFixed(0)}M power`}
                          weights={config.weightsT5}
                          disabled={!isOfficer}
                          onChange={(k, v) => setWeight('weightsT5', k, v)}
                        />
                      </>
                    ) : (
                      <WeightBand
                        title={t('weightsCard.allTitle')}
                        subtitle={t('weightsCard.allSubtitle')}
                        weights={config.weightsT5}
                        disabled={!isOfficer}
                        onChange={(k, v) => setWeight('weightsT5', k, v)}
                      />
                    )}
                  </div>
                </ConfigCard>

                <ConfigCard
                  title={t('cutoffsCard.title')}
                  hint="The minimum final score (0–100) needed to land in each tier. Anything below the GOOD cutoff falls into REVIEW (still listed, just flagged for officer attention)."
                >
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 px-3 divide-y divide-[var(--border)]/50">
                    <CutoffRow
                      status="EXCELLENT"
                      value={config.statusThresholds.excellent}
                      disabled={!isOfficer}
                      onChange={(v) => setThreshold('excellent', v)}
                    />
                    <CutoffRow
                      status="APPROVED"
                      value={config.statusThresholds.approved}
                      disabled={!isOfficer}
                      onChange={(v) => setThreshold('approved', v)}
                    />
                    <CutoffRow
                      status="GOOD"
                      value={config.statusThresholds.good}
                      disabled={!isOfficer}
                      onChange={(v) => setThreshold('good', v)}
                    />
                    {/* REVIEW: read-only fallback row, automatically anything below GOOD */}
                    <div className="flex items-center gap-3 py-2">
                      <span
                        className={`inline-flex items-center justify-center w-20 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES.REJECTED} flex-shrink-0`}
                      >
                        {STATUS_LABELS.REJECTED}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] flex-1">
                        {t('cutoffsCard.anythingBelow', { n: Math.round(config.statusThresholds.good) })}
                      </span>
                    </div>
                  </div>
                </ConfigCard>
                </div>
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
      // In model view we still show the kingdom-wide score for status consistency,
      // but render the band score as a small subtitle for context.
      return (
        <span className="font-semibold text-[var(--foreground)]">
          {fmtScore(p.finalScore)}
          {modelView && (
            <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
              ({BAND_LABELS[p.band]} {fmtScore(p.bandScore)})
            </span>
          )}
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
  tone?: 'amber' | 'emerald' | 'sky' | 'red';
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-400'
      : tone === 'emerald'
        ? 'text-emerald-400'
        : tone === 'sky'
          ? 'text-sky-400'
          : tone === 'red'
            ? 'text-red-400'
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

/** Single coefficient input for the DKP formula (label above, number input below). */
function FormulaCoef({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <div>
      <Tooltip content={hint}>
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)] block mb-1.5 cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
          {label}
        </label>
      </Tooltip>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text);
          if (Number.isNaN(n) || n < 0) {
            setText(String(value));
            return;
          }
          onChange(n);
          setText(String(n));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-full px-2.5 py-2 rounded bg-[var(--background)] border border-[var(--border)] text-base tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
      />
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
  // Show T5 weights as the headline (matches the unsplit "all players" mode).
  const w = config.weightsT5;
  const cuts = config.statusThresholds;
  return (
    <span>
      DKP {Math.round(w.dkp)} • RSS {Math.round(w.rss)} • Helps {Math.round(w.helps)} • Honor{' '}
      {Math.round(w.honor)}
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

const WEIGHT_LABELS: Record<keyof WeightSet, { label: string; hint: string; color: string }> = {
  dkp: {
    label: 'DKP',
    hint: 'Combined kills + deaths score using the formula coefficients on the left. Higher kills + deaths during KvK = higher DKP.',
    color: 'bg-violet-500',
  },
  rss: {
    label: 'RSS',
    hint: 'Resources gathered from the kingdom map (food, wood, stone, gold). Rewards active gathering.',
    color: 'bg-amber-500',
  },
  helps: {
    label: 'Helps',
    hint: 'Alliance helps given. Rewards being active in the alliance and supporting teammates.',
    color: 'bg-sky-500',
  },
  honor: {
    label: 'Honor',
    hint: 'Honor points earned (PvP, events). Imported from the Statmaster honor rankings file.',
    color: 'bg-emerald-500',
  },
};

const FORMULA_LABELS: Record<keyof DkpFormula, { label: string; hint: string }> = {
  t4Kill: {
    label: 'T4 Kill',
    hint: 'Points awarded for each Tier 4 kill made during KvK.',
  },
  t5Kill: {
    label: 'T5 Kill',
    hint: 'Points awarded for each Tier 5 kill. T5 are the strongest troops, so usually weighted higher than T4 kills.',
  },
  t4Death: {
    label: 'T4 Death',
    hint: 'Points awarded for each Tier 4 death (sacrifice). Deaths typically count more than kills since they cost the player real troops.',
  },
  t5Death: {
    label: 'T5 Death',
    hint: 'Points awarded for each Tier 5 death. Usually the highest coefficient in the formula since T5 sacrifices are the most costly.',
  },
};

const CUTOFF_HINTS: Record<Status, string> = {
  EXCELLENT:
    'Top tier — players whose final score is at or above this threshold are marked EXCELLENT.',
  APPROVED: 'Players hitting at least this threshold are STRONG (clearly pulling weight, just below the top tier).',
  GOOD: 'Players hitting at least this threshold are GOOD (acceptable). Below this they fall into REVIEW.',
  REJECTED: 'Anything below the GOOD threshold lands here. Flagged for officer attention rather than auto-rejected.',
};

/** A clean horizontal weight row: dot + label + slider + number input. */
function WeightRow({
  weightKey,
  value,
  onChange,
  disabled = false,
}: {
  weightKey: keyof WeightSet;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const meta = WEIGHT_LABELS[weightKey];
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
      className={`flex items-center gap-3 py-1.5 ${disabled ? 'opacity-70' : ''} ${isOff ? 'opacity-50' : ''}`}
    >
      <Tooltip content={meta.hint} className="w-24 sm:w-28 flex-shrink-0">
        <span className="flex items-center gap-2 cursor-help">
          <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
          <span className="text-sm font-medium text-[var(--foreground)] underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
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
      <div className="relative flex-shrink-0">
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
    </div>
  );
}

/** A card containing all 5 weight rows for one band. */
function WeightBand({
  title,
  subtitle,
  weights,
  onChange,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  weights: WeightSet;
  onChange: (key: keyof WeightSet, value: number) => void;
  disabled?: boolean;
}) {
  const total = (['dkp', 'rss', 'helps', 'honor'] as const).reduce(
    (s, k) => s + weights[k],
    0,
  );
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/40 px-4 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
          {subtitle && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</div>
          )}
        </div>
        <div
          className="text-[11px] text-[var(--text-muted)] tabular-nums"
          title="Effective share of each weight after dividing by the total"
        >
          {total > 0
            ? (['dkp', 'rss', 'helps', 'honor'] as const)
                .map((k) => `${Math.round((weights[k] / total) * 100)}%`)
                .join(' / ')
            : '—'}
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]/50">
        {(['dkp', 'rss', 'helps', 'honor'] as const).map((k) => (
          <WeightRow
            key={k}
            weightKey={k}
            value={weights[k]}
            disabled={disabled}
            onChange={(v) => onChange(k, v)}
          />
        ))}
      </div>
    </div>
  );
}

/** Status cutoff row with colored badge, slider, and value input. */
function CutoffRow({
  status,
  value,
  onChange,
  disabled = false,
}: {
  status: Status;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  // Cutoffs and the final score live on the same 0–100 scale, so no conversion needed.
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
      ? 'accent-amber-400'
      : status === 'APPROVED'
        ? 'accent-emerald-400'
        : 'accent-sky-400';
  return (
    <div className={`flex items-center gap-3 py-1.5 ${disabled ? 'opacity-70' : ''}`}>
      <Tooltip content={CUTOFF_HINTS[status]} className="flex-shrink-0">
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
      <div className="relative flex-shrink-0">
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
          className="w-16 px-1.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
