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
  Flag,
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
  loadConfigRow,
  saveConfigRow,
  subscribeToConfigRow,
  MIGRATION_ROW_ID,
} from './data';
import {
  type BandFormula,
  type FormulaKey,
  type CutoffSet,
  type Config,
  type SimpleFormula,
  type Status,
  type Band,
  type ModelStats,
  type ScoredPlayer,
  FORMULA_KEYS,
  BAND_LABELS,
  DEFAULT_CUTOFFS,
  DEFAULT_FORMULA_MICRO,
  DEFAULT_FORMULA_MID,
  DEFAULT_FORMULA_STRONG,
  DEFAULT_FORMULA_T5,
  DEFAULT_SIMPLE_FORMULA,
  DEFAULT_CONFIG,
  normalizeFormula,
  median,
  bandOf,
  computeModels,
  computeScores,
} from '@/lib/dkp/scoring';

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

  // Thresholds: prefer new 4-band keys, fall back to legacy 3-band (mt4T4/t4T5) or 2-band.
  const microMidThreshold = partial.microMidThreshold
    ?? (legacy as Record<string, unknown>).mt4T4Threshold as number | undefined
    ?? base.microMidThreshold;
  const midStrongThreshold = partial.midStrongThreshold ?? base.midStrongThreshold;
  const strongT5Threshold = partial.strongT5Threshold
    ?? (legacy as Record<string, unknown>).t4T5Threshold as number | undefined
    ?? legacy.weightSplitThreshold
    ?? base.strongT5Threshold;

  // Per-band formulas: prefer new 4-band keys, then legacy 3-band (formulaMt4/T4), then 2-band.
  const legacyLow = legacy.weightsMt4 ?? legacy.weightsLow;
  const legacyHigh = legacy.weightsT5 ?? legacy.weightsHigh;
  const legacyMid = legacy.weightsT4 ?? legacyLow;
  const prev3 = partial as Record<string, BandFormula | undefined>;

  const mergeF = (key: keyof Config, fallback3: string, legacyW: typeof legacyLow) =>
    normalizeFormula(
      (partial as Record<string, BandFormula | undefined>)[key]
        ? { ...((base as unknown as Record<string, BandFormula>)[key]), ...(partial as Record<string, BandFormula>)[key] }
        : prev3[fallback3]
          ? { ...(base as unknown as Record<string, BandFormula>)[key], ...prev3[fallback3]! }
          : legacyToBandFormula((base as unknown as Record<string, BandFormula>)[key], legacy.dkpFormula, legacyW),
    );

  const formulaMicroT4 = mergeF('formulaMicroT4', 'formulaMicroT4', legacyLow);
  const formulaMidT4 = mergeF('formulaMidT4', 'formulaMicroT4', legacyLow);
  const formulaStrongT4 = mergeF('formulaStrongT4', 'formulaStrongT4', legacyMid);
  const formulaT5 = mergeF('formulaT5', 'formulaT5', legacyHigh);

  // Per-band cutoffs.
  const legacyCuts = migrateCutoffs(legacy.statusThresholds);
  const mergeC = (key: keyof Config, fallback3: string) => ({
    ...(base as unknown as Record<string, CutoffSet>)[key],
    ...legacyCuts,
    ...((prev3[fallback3] ?? {}) as Partial<CutoffSet>),
    ...((partial as Record<string, Partial<CutoffSet> | undefined>)[key] ?? {}),
  });
  const cutoffsMicroT4 = mergeC('cutoffsMicroT4', 'cutoffsMicroT4');
  const cutoffsMidT4 = mergeC('cutoffsMidT4', 'cutoffsMicroT4');
  const cutoffsStrongT4 = mergeC('cutoffsStrongT4', 'cutoffsStrongT4');
  const cutoffsT5 = mergeC('cutoffsT5', 'cutoffsT5');

  // KP targets.
  const kpTargetMicroT4 = partial.kpTargetMicroT4 ?? (legacy as Record<string, number>).kpTargetMt4 ?? legacy.kpTargetLow ?? base.kpTargetMicroT4;
  const kpTargetMidT4 = partial.kpTargetMidT4 ?? (legacy as Record<string, number>).kpTargetMt4 ?? legacy.kpTargetLow ?? base.kpTargetMidT4;
  const kpTargetStrongT4 = partial.kpTargetStrongT4 ?? (legacy as Record<string, number>).kpTargetT4 ?? legacy.kpTargetLow ?? base.kpTargetStrongT4;
  const kpTargetT5 = partial.kpTargetT5 ?? legacy.kpTargetHigh ?? base.kpTargetT5;

  return {
    ...base,
    ...partial,
    microMidThreshold,
    midStrongThreshold,
    strongT5Threshold,
    formulaMicroT4,
    formulaMidT4,
    formulaStrongT4,
    formulaT5,
    kpTargetMicroT4,
    kpTargetMidT4,
    kpTargetStrongT4,
    kpTargetT5,
    cutoffsMicroT4,
    cutoffsMidT4,
    cutoffsStrongT4,
    cutoffsT5,
    rankedMode: partial.rankedMode ?? base.rankedMode,
    rankedTopN: partial.rankedTopN ?? base.rankedTopN,
    rankedMinPower: partial.rankedMinPower ?? base.rankedMinPower,
    simpleFormula: partial.simpleFormula
      ? { ...base.simpleFormula, ...partial.simpleFormula }
      : base.simpleFormula,
    simpleMultiplier: partial.simpleMultiplier ?? base.simpleMultiplier,
  };
}

/** Friendlier display labels. */
const STATUS_LABELS: Record<Status, string> = {
  EXCELLENT: 'EXCELLENT',
  APPROVED: 'STRONG',
  GOOD: 'GOOD',
  REJECTED: 'REVIEW',
  UNRANKED: 'UNRANKED',
};

/** Softer label for non-officers so visitors don't panic when they see their own row. */
function statusLabel(status: Status, isOfficer: boolean): string {
  if (!isOfficer && status === 'REJECTED') return 'LOW';
  return STATUS_LABELS[status];
}

const nf = new Intl.NumberFormat('en-US');
const fmt = (n: number) => nf.format(Math.round(n));
/** Format large numbers as millions with 2 decimals (e.g. 69_861_875 → "69.86M"). */
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(2)}M`;
/** Display the final score as a 0–100 number rounded to one decimal. */
const fmtScore = (n: number) => n.toFixed(1);
/** Format as millions, clamped to 0. If the raw value is negative, show 0.00M with a warning tooltip. */
function fmtMClamped(n: number) {
  if (n >= 0) return fmtM(n);
  return (
    <span className="text-amber-400 cursor-help" title={`Raw data: ${fmtM(n)} (negative — likely a spreadsheet import issue)`}>
      0.00M ⚠
    </span>
  );
}

// Status palette is intentionally distinct from the KP cell palette (green/amber/red).
// This way the Score color matches the Status pill color and there's no collision.
const STATUS_STYLES: Record<Status, string> = {
  EXCELLENT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  APPROVED: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  GOOD: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  UNRANKED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

/** Tailwind text-only class for each status — used to color the Score column to match the pill. */
const STATUS_TEXT: Record<Status, string> = {
  EXCELLENT: 'text-violet-400',
  APPROVED: 'text-cyan-400',
  GOOD: 'text-indigo-400',
  REJECTED: 'text-rose-400',
  UNRANKED: 'text-zinc-400',
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
  { key: 'dkp', label: 'DKP', numeric: true, defaultVisible: true, hint: 'DKP = (T4 Kills × weight) + (T5 Kills × weight) + (T4 Deaths × weight) + (T5 Deaths × weight), using the band\'s formula weights. This is a standalone combat number — it does NOT determine the Score or Status. The Score uses all 7 components (kills, deaths, RSS, helps, honor) normalized within the band.' },
  { key: 'finalScore', label: 'Score', numeric: true, defaultVisible: true, hint: '0–100 score within the player\'s own power band. Each stat is normalized against the best in that band, then blended by the band\'s formula weights. This score drives the status tier.' },
  { key: 'status', label: 'Status', defaultVisible: true, hint: 'Tier based on the player\'s band score: EXCELLENT / STRONG / GOOD / REVIEW (top 400 by power) or UNRANKED (outside top 400). Hover any pill for details.' },
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
  const [hideUnranked, setHideUnranked] = useState(true);
  const [scoringMode, setScoringMode] = useState<'bands' | 'simple'>('simple');
  const [simpleSortKey, setSimpleSortKey] = useState<'name' | 'power' | 'dkp' | 'ratio' | 'status' | 't4Kills' | 't5Kills' | 't4Deaths' | 't5Deaths' | 'kp' | 'flagged'>('dkp');
  const [simpleSortDir, setSimpleSortDir] = useState<'asc' | 'desc'>('desc');
  const [simpleHideOutsideTop, setSimpleHideOutsideTop] = useState(false);
  const [simpleMinPowerInput, setSimpleMinPowerInput] = useState('');
  const [showGovId, setShowGovId] = useState(false);
  /** When true, numeric stat cells render as ratios vs the player's band model instead of raw values. */
  const [modelView, setModelView] = useState(false);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  /** Set of characterIds that officers have flagged for migration. Shared via Supabase. */
  const [flaggedForMigration, setFlaggedForMigration] = useState<Set<number>>(new Set());
  const migrationDirtyRef = useRef(false);

  // Load migration list from Supabase on mount + subscribe to remote changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await loadConfigRow<number[]>(MIGRATION_ROW_ID);
      if (!cancelled && remote) {
        setFlaggedForMigration(new Set(remote));
      }
    })();
    const unsub = subscribeToConfigRow<number[]>(MIGRATION_ROW_ID, (ids) => {
      if (!migrationDirtyRef.current) {
        setFlaggedForMigration(new Set(ids));
      }
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  const toggleFlagged = (id: number) => {
    setFlaggedForMigration((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const flagAllReview = () => {
    const reviewIds = scored.filter((p) => p.status === 'REJECTED').map((p) => p.characterId);
    setFlaggedForMigration((prev) => {
      const next = new Set(prev);
      for (const id of reviewIds) next.add(id);
      return next;
    });
  };
  const clearFlagged = () => setFlaggedForMigration(new Set());

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

  // Simple-ratio scoring: just DKP vs power multiplier. Independent from the band system.
  const simpleScored = useMemo(() => {
    const f = config.simpleFormula;
    return players.map((p) => {
      const dkp =
        (p.t4Kills ?? 0) * f.t4Kill +
        (p.t5Kills ?? 0) * f.t5Kill +
        (p.t4Deaths ?? 0) * f.t4Death +
        (p.t5Deaths ?? 0) * f.t5Death;
      const target = p.power * config.simpleMultiplier;
      const ratio = p.power > 0 ? dkp / p.power : 0;
      const pass = dkp >= target;
      return { ...p, simpleDkp: dkp, simpleTarget: target, simpleRatio: ratio, simpleStatus: pass ? ('PASS' as const) : ('BELOW' as const) };
    });
  }, [players, config.simpleFormula, config.simpleMultiplier]);

  // Top-N gov IDs by power — used to hide accounts outside the top N in the simple view.
  const simpleTopNIds = useMemo(() => {
    const sorted = [...simpleScored].sort((a, b) => b.power - a.power);
    return new Set(sorted.slice(0, config.rankedTopN).map((p) => p.characterId));
  }, [simpleScored, config.rankedTopN]);

  // Parsed min-power threshold (input is in millions; empty/invalid means no floor).
  const simpleMinPower = useMemo(() => {
    const n = parseFloat(simpleMinPowerInput.trim());
    return Number.isFinite(n) && n > 0 ? n * 1_000_000 : 0;
  }, [simpleMinPowerInput]);

  // Sort + top-N filter first (search-independent) so rank stays stable across searches.
  const simpleRanked = useMemo(() => {
    let list = simpleScored;
    if (simpleHideOutsideTop) list = list.filter((p) => simpleTopNIds.has(p.characterId));
    if (simpleMinPower > 0) list = list.filter((p) => p.power >= simpleMinPower);
    const dir = simpleSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (simpleSortKey) {
        case 'name': return a.username.localeCompare(b.username) * dir;
        case 'power': return (a.power - b.power) * dir;
        case 'dkp': return (a.simpleDkp - b.simpleDkp) * dir;
        case 'ratio': return (a.simpleRatio - b.simpleRatio) * dir;
        case 'status': return (a.simpleStatus === b.simpleStatus ? 0 : a.simpleStatus === 'PASS' ? -1 : 1) * dir;
        case 't4Kills': return (a.t4Kills - b.t4Kills) * dir;
        case 't5Kills': return (a.t5Kills - b.t5Kills) * dir;
        case 't4Deaths': return (a.t4Deaths - b.t4Deaths) * dir;
        case 't5Deaths': return (a.t5Deaths - b.t5Deaths) * dir;
        case 'kp': return (a.totalKP - b.totalKP) * dir;
        case 'flagged': {
          const af = flaggedForMigration.has(a.characterId) ? 1 : 0;
          const bf = flaggedForMigration.has(b.characterId) ? 1 : 0;
          return (af - bf) * dir;
        }
      }
    });
  }, [simpleScored, simpleSortKey, simpleSortDir, simpleHideOutsideTop, simpleTopNIds, simpleMinPower, flaggedForMigration]);

  const simpleRankById = useMemo(() => {
    const m = new Map<number, number>();
    simpleRanked.forEach((p, i) => m.set(p.characterId, i + 1));
    return m;
  }, [simpleRanked]);

  const simpleFiltered = useMemo(() => {
    if (!search.trim()) return simpleRanked;
    const q = search.trim();
    const qDigits = q.replace(/\D/g, '');
    return simpleRanked.filter(
      (p) => looseMatch(p.username, q) || (qDigits.length >= 3 && String(p.characterId).includes(qDigits)),
    );
  }, [simpleRanked, search]);

  // Migration impact stats for the simple view (officer-only UI).
  // "Zeroing drops power by ~15%" → kingdom loses 15% of each zeroed player's current power.
  const ZERO_POWER_DROP = 0.15;
  const simpleMigrationImpact = useMemo(() => {
    const totalPower = simpleScored.reduce((s, p) => s + p.power, 0);
    let flaggedPower = 0;
    for (const p of simpleScored) {
      if (flaggedForMigration.has(p.characterId)) flaggedPower += p.power;
    }
    const afterMigration = totalPower - flaggedPower;
    const zeroLoss = flaggedPower * ZERO_POWER_DROP;
    const afterZero = totalPower - zeroLoss;
    return { totalPower, flaggedPower, afterMigration, zeroLoss, afterZero };
  }, [simpleScored, flaggedForMigration]);

  // Two sets of counts: filtered (reflects Top-N + min-power) and full (all scored).
  const simpleCounts = useMemo(() => {
    let pass = 0, below = 0, passAll = 0, belowAll = 0;
    for (const p of simpleRanked) {
      if (p.simpleStatus === 'PASS') pass++;
      else below++;
    }
    for (const p of simpleScored) {
      if (p.simpleStatus === 'PASS') passAll++;
      else belowAll++;
    }
    return { pass, below, passAll, belowAll };
  }, [simpleRanked, simpleScored]);

  // The Score column (key 'finalScore') now displays bandScore, so sort by bandScore when that key is active.
  const sortProp = sortKey === 'finalScore' ? 'bandScore' : sortKey;

  // Global rank by current sort, ignoring filters — so search doesn't renumber rows.
  const globalRankById = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...scored].sort((a, b) => {
      if (sortProp === 'username') return a.username.localeCompare(b.username) * dir;
      const av = (a as unknown as Record<string, number>)[sortProp] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortProp] ?? 0;
      return (av - bv) * dir;
    });
    const map = new Map<number, number>();
    sorted.forEach((p, i) => map.set(p.characterId, i + 1));
    return map;
  }, [scored, sortProp, sortDir]);

  const filtered = useMemo(() => {
    let list = scored;
    if (hideUnranked && statusFilter !== 'UNRANKED') list = list.filter((p) => p.status !== 'UNRANKED');
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
      if (sortProp === 'username') return a.username.localeCompare(b.username) * dir;
      const av = (a as unknown as Record<string, number>)[sortProp] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortProp] ?? 0;
      return (av - bv) * dir;
    });
    return list;
  }, [scored, search, sortProp, sortDir, statusFilter, hideUnranked]);

  const summary = useMemo(() => {
    const counts: Record<Status, number> = { EXCELLENT: 0, APPROVED: 0, GOOD: 0, REJECTED: 0, UNRANKED: 0 };
    let totalDkp = 0;
    for (const p of scored) {
      counts[p.status]++;
      totalDkp += p.dkp || p.computedDkp;
    }
    return { counts, totalDkp, total: scored.length };
  }, [scored]);

  /** Power floor for the "Kingdom Power" migration card — adjustable by the officer. */
  const [migrationPowerFloor, setMigrationPowerFloor] = useState(15_000_000);

  /** Migration impact stats — computed from the flagged set. */
  const migrationImpact = useMemo(() => {
    const flaggedPlayers = scored.filter((p) => flaggedForMigration.has(p.characterId));
    const flaggedPower = flaggedPlayers.reduce((s, p) => s + p.power, 0);
    const minPowerForTotal = migrationPowerFloor;
    const allAboveMin = scored.filter((p) => p.power >= minPowerForTotal);
    const totalPowerAboveMin = allAboveMin.reduce((s, p) => s + p.power, 0);
    // Top N power (using the ranked cutoff).
    const topN = [...scored].sort((a, b) => b.power - a.power).slice(0, config.rankedTopN);
    const topNPower = topN.reduce((s, p) => s + p.power, 0);
    const flaggedInTopN = flaggedPlayers.filter((p) => topN.some((t) => t.characterId === p.characterId));
    const flaggedTopNPower = flaggedInTopN.reduce((s, p) => s + p.power, 0);
    return {
      count: flaggedPlayers.length,
      power: flaggedPower,
      totalPowerAboveMin,
      minPowerForTotal,
      topNPower,
      flaggedTopNPower,
    };
  }, [scored, flaggedForMigration, migrationPowerFloor, config.rankedTopN]);

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      // Normalize each band's formula so its largest weight is ~100 before publishing.
      // The math is invariant to a uniform scale, so this doesn't change anyone's score —
      // it just keeps the slider values in a friendly 0–100 range for everyone on next load.
      const tidied: Config = {
        ...config,
        formulaMicroT4: normalizeFormula(config.formulaMicroT4),
        formulaMidT4: normalizeFormula(config.formulaMidT4),
        formulaStrongT4: normalizeFormula(config.formulaStrongT4),
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
    band: 'formulaMicroT4' | 'formulaMidT4' | 'formulaStrongT4' | 'formulaT5',
    key: FormulaKey,
    value: number,
  ) => {
    setConfig((c) => ({ ...c, [band]: { ...c[band], [key]: value } }));
  };
  const setCutoff = (
    band: 'cutoffsMicroT4' | 'cutoffsMidT4' | 'cutoffsStrongT4' | 'cutoffsT5',
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
          <div className="flex items-center gap-2">
            {isOfficer && (
              <a
                href="/migration"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Flag size={12} /> Emigration Cases
              </a>
            )}
            <OfficerBadge />
          </div>
        </header>

        {/* Officer-only upload panel */}
        {isOfficer && (
          <UploadPanel
            onUploaded={handleDatasetUpload}
            onReset={handleResetDataset}
            currentDataset={dataset}
          />
        )}

        {/* Scoring mode toggle — officers only; non-officers always see simple mode. */}
        {isOfficer && (
          <section className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider mr-1">Scoring mode:</span>
            <div className="inline-flex rounded-lg overflow-hidden border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setScoringMode('bands')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  scoringMode === 'bands'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                Power Bands
              </button>
              <button
                type="button"
                onClick={() => setScoringMode('simple')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  scoringMode === 'simple'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                Simple Ratio
              </button>
            </div>
            {scoringMode === 'simple' && (
              <span className="text-xs text-[var(--text-muted)]">
                DKP ≥ power × <span className="font-mono text-[var(--text-secondary)]">{config.simpleMultiplier}</span>
              </span>
            )}
          </section>
        )}

        {/* Summary */}
        {scoringMode === 'bands' && (
          <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-6">
            <SummaryCard label={t('summary.players')} value={fmt(summary.total)} />
            <SummaryCard label={t('summary.totalDkp')} value={fmt(summary.totalDkp)} />
            <SummaryCard label={t('summary.excellent')} value={fmt(summary.counts.EXCELLENT)} tone="excellent" />
            <SummaryCard label={t('summary.strong')} value={fmt(summary.counts.APPROVED)} tone="approved" />
            <SummaryCard label={t('summary.good')} value={fmt(summary.counts.GOOD)} tone="good" />
            <SummaryCard label={isOfficer ? t('summary.review') : t('summary.low')} value={fmt(summary.counts.REJECTED)} tone="review" />
          </section>
        )}

        {/* Simple-ratio summary — officer+ only; viewers see just the table. */}
        {scoringMode === 'simple' && isOfficer && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
            {(() => {
              const filterParts: string[] = [];
              if (simpleHideOutsideTop) filterParts.push(`top ${config.rankedTopN} by power`);
              if (simpleMinPower > 0) filterParts.push(`≥${(simpleMinPower / 1_000_000).toFixed(0)}M power`);
              const filterDesc = filterParts.length ? filterParts.join(' · ') : 'no filter';
              const passExcluded = simpleCounts.passAll - simpleCounts.pass;
              const belowExcluded = simpleCounts.belowAll - simpleCounts.below;
              const playersExcluded = simpleScored.length - simpleRanked.length;
              const totalDkpInFilter = simpleRanked.reduce((s, p) => s + p.simpleDkp, 0);
              const totalDkpAll = simpleScored.reduce((s, p) => s + p.simpleDkp, 0);
              const dkpExcluded = totalDkpAll - totalDkpInFilter;
              const sub = (excluded: number) =>
                filterParts.length === 0
                  ? 'no filter applied'
                  : excluded === 0
                    ? `match: ${filterDesc}`
                    : `match: ${filterDesc} · ${fmt(excluded)} hidden`;
              return (
                <>
                  <SummaryCard label="Players in view" value={fmt(simpleRanked.length)} subvalue={sub(playersExcluded)} />
                  <SummaryCard label="Pass (in view)" value={fmt(simpleCounts.pass)} subvalue={sub(passExcluded)} tone="good" />
                  <SummaryCard label={isOfficer ? 'Below (in view)' : 'Low (in view)'} value={fmt(simpleCounts.below)} subvalue={sub(belowExcluded)} tone="review" />
                  <SummaryCard label="DKP (in view)" value={fmt(totalDkpInFilter)} subvalue={sub(dkpExcluded)} />
                </>
              );
            })()}
          </section>
        )}

        {/* Simple-ratio migration impact (officer-only) */}
        {scoringMode === 'simple' && isOfficer && (
          <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Emigration Impact</h2>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {flaggedForMigration.size} flagged · {fmtM(simpleMigrationImpact.flaggedPower)} power
                {simpleMigrationImpact.totalPower > 0 && (
                  <> ({((simpleMigrationImpact.flaggedPower / simpleMigrationImpact.totalPower) * 100).toFixed(1)}% of kingdom)</>
                )}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Kingdom Power</div>
                <div className="text-xl font-bold tabular-nums text-[var(--foreground)]">
                  {fmtM(simpleMigrationImpact.totalPower)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Current total (all visible players)</div>
              </div>
              <div className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-3">
                <div className="text-xs text-rose-400 uppercase tracking-wider mb-1">If Flagged Emigrate</div>
                <div className="text-xl font-bold tabular-nums text-rose-400">
                  {fmtM(simpleMigrationImpact.afterMigration)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  −{fmtM(simpleMigrationImpact.flaggedPower)}
                  {simpleMigrationImpact.totalPower > 0 && (
                    <> ({((simpleMigrationImpact.flaggedPower / simpleMigrationImpact.totalPower) * 100).toFixed(1)}% loss)</>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <div className="text-xs text-amber-400 uppercase tracking-wider mb-1">If Flagged Zeroed ({Math.round(ZERO_POWER_DROP * 100)}%)</div>
                <div className="text-xl font-bold tabular-nums text-amber-400">
                  {fmtM(simpleMigrationImpact.afterZero)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  −{fmtM(simpleMigrationImpact.zeroLoss)}
                  {simpleMigrationImpact.totalPower > 0 && (
                    <> ({((simpleMigrationImpact.zeroLoss / simpleMigrationImpact.totalPower) * 100).toFixed(2)}% loss)</>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Officer-only: Migration Simulator */}
        {scoringMode === 'bands' && isOfficer && (
          <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">Emigration Simulator</h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  Flag players to see the power impact before committing. Use the flag icons in the table, or the quick-actions below.
                </p>
              </div>
              {flaggedForMigration.size > 0 && (
                <span className="text-sm font-semibold text-rose-400 tabular-nums">
                  {flaggedForMigration.size} flagged
                </span>
              )}
            </div>

            <div className="p-5">
              {/* Settings row */}
              <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-[var(--text-secondary)]">
                <span>Kingdom power floor:</span>
                <Tooltip content="Only players above this power level are counted in the 'Kingdom Power' card. Adjust to see impact on different power tiers.">
                  <span className="cursor-help"><Info size={13} className="text-[var(--text-muted)]" /></span>
                </Tooltip>
                <PowerInput
                  value={migrationPowerFloor}
                  onChange={(v) => setMigrationPowerFloor(Math.max(0, v))}
                />
                <span className="text-xs text-[var(--text-muted)]">
                  ({scored.filter((p) => p.power >= migrationPowerFloor).length} players above this)
                </span>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <Tooltip content={`Instantly flag all ${summary.counts.REJECTED} players currently in REVIEW status. These are ranked players whose band score fell below the GOOD cutoff — likely underperforming for their power level.`}>
                  <button
                    onClick={flagAllReview}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
                  >
                    Flag all {summary.counts.REJECTED} REVIEW players
                  </button>
                </Tooltip>
                {flaggedForMigration.size > 0 && (
                  <button
                    onClick={clearFlagged}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    Clear all flags
                  </button>
                )}
              </div>

              {flaggedForMigration.size > 0 ? (
                <>
                  {/* Impact dashboard — 4 standalone cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                    {/* 1. Players leaving */}
                    <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-5">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="text-sm font-semibold text-rose-400">Players Leaving</div>
                        <Tooltip content="How many flagged players would leave the kingdom.">
                          <span className="cursor-help text-rose-400/60"><Info size={13} /></span>
                        </Tooltip>
                      </div>
                      <div className="text-4xl font-bold text-rose-400 tabular-nums">
                        {migrationImpact.count}
                      </div>
                      <div className="text-sm text-[var(--text-muted)] mt-2">
                        out of {scored.length} total ({((migrationImpact.count / scored.length) * 100).toFixed(1)}%)
                      </div>
                      <div className="text-sm text-[var(--text-secondary)] mt-1">
                        {scored.length - migrationImpact.count} would remain
                      </div>
                    </div>

                    {/* 2. Total power leaving */}
                    <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-5">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="text-sm font-semibold text-rose-400">Power Leaving</div>
                        <Tooltip content="The raw sum of every flagged player's current power. Not weighted by band or score — just the actual power numbers added up.">
                          <span className="cursor-help text-rose-400/60"><Info size={13} /></span>
                        </Tooltip>
                      </div>
                      <div className="text-4xl font-bold text-rose-400 tabular-nums">
                        {fmtM(migrationImpact.power)}
                      </div>
                      <div className="text-sm text-[var(--text-muted)] mt-2">
                        {migrationImpact.totalPowerAboveMin > 0
                          ? `${((migrationImpact.power / migrationImpact.totalPowerAboveMin) * 100).toFixed(1)}% of all power ≥${(migrationImpact.minPowerForTotal / 1_000_000).toFixed(0)}M`
                          : '—'}
                      </div>
                    </div>

                    {/* 3. Kingdom total power impact */}
                    <div className="rounded-xl bg-[var(--background)] border border-[var(--border)] p-5">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="text-sm font-semibold text-[var(--foreground)]">Kingdom Power</div>
                        <Tooltip content={`Total power of all players with ≥${(migrationImpact.minPowerForTotal / 1_000_000).toFixed(0)}M power. If the flagged players leave, it drops from ${fmtM(migrationImpact.totalPowerAboveMin)} to ${fmtM(migrationImpact.totalPowerAboveMin - migrationImpact.power)}.`}>
                          <span className="cursor-help text-[var(--text-muted)]"><Info size={13} /></span>
                        </Tooltip>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-[var(--foreground)] tabular-nums">
                          {fmtM(migrationImpact.totalPowerAboveMin - migrationImpact.power)}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--text-muted)] mt-2">
                        Currently {fmtM(migrationImpact.totalPowerAboveMin)}
                      </div>
                      <div className="text-sm text-rose-400 font-medium mt-0.5">
                        −{fmtM(migrationImpact.power)} ({((migrationImpact.power / migrationImpact.totalPowerAboveMin) * 100).toFixed(1)}% drop)
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        accounts ≥{(migrationImpact.minPowerForTotal / 1_000_000).toFixed(0)}M only
                      </div>
                    </div>

                    {/* 4. Top N power impact */}
                    <div className="rounded-xl bg-[var(--background)] border border-[var(--border)] p-5">
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="text-sm font-semibold text-[var(--foreground)]">Top {config.rankedTopN} Power</div>
                        <Tooltip content={`Combined power of the top ${config.rankedTopN} players by power. If any flagged players are in this group, their power is subtracted. Currently ${fmtM(migrationImpact.topNPower)} → after migration ${fmtM(migrationImpact.topNPower - migrationImpact.flaggedTopNPower)}.`}>
                          <span className="cursor-help text-[var(--text-muted)]"><Info size={13} /></span>
                        </Tooltip>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-[var(--foreground)] tabular-nums">
                          {fmtM(migrationImpact.topNPower - migrationImpact.flaggedTopNPower)}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--text-muted)] mt-2">
                        Currently {fmtM(migrationImpact.topNPower)}
                      </div>
                      {migrationImpact.flaggedTopNPower > 0 ? (
                        <div className="text-sm text-rose-400 font-medium mt-0.5">
                          −{fmtM(migrationImpact.flaggedTopNPower)} ({((migrationImpact.flaggedTopNPower / migrationImpact.topNPower) * 100).toFixed(1)}% drop)
                        </div>
                      ) : (
                        <div className="text-sm text-emerald-400 font-medium mt-0.5">
                          No impact — no flagged players in top {config.rankedTopN}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Flagged player chips */}
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-2">
                      Flagged Players (click to remove)
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {scored
                        .filter((p) => flaggedForMigration.has(p.characterId))
                        .sort((a, b) => a.power - b.power)
                        .map((p) => (
                          <button
                            key={p.characterId}
                            onClick={() => toggleFlagged(p.characterId)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25 transition-colors"
                          >
                            <span>{p.username}</span>
                            <span className="text-[10px] text-rose-400/50">{fmtM(p.power)}</span>
                            <X size={10} />
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Commit action */}
                  <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
                    <button
                      onClick={async () => {
                        try {
                          migrationDirtyRef.current = true;
                          await saveConfigRow(MIGRATION_ROW_ID, [...flaggedForMigration]);
                          migrationDirtyRef.current = false;
                        } catch (e) {
                          console.error('Failed to save migration list', e);
                          migrationDirtyRef.current = false;
                        }
                      }}
                      className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                    >
                      Save migration list for all officers
                    </button>
                    <span className="text-xs text-[var(--text-muted)]">
                      Saves to the shared database — all officers will see this list.
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🏴</div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">No players flagged for migration yet.</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Use the flag icons (<svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 inline text-[var(--text-muted)]"><path d="M2 1a1 1 0 0 1 1 1v1h9.5a.5.5 0 0 1 .4.8L10.5 7l2.4 3.2a.5.5 0 0 1-.4.8H3v4a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1z"/></svg>) in the table to flag individual players, or use the quick-actions above to flag by status.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {scoringMode === 'bands' && (<>
        {/* Scoring Configuration (collapsible) */}
        <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] overflow-hidden">
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
                    {t('config.sandbox')}
                  </span>
                )}
                {isDirty && (
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                    {isOfficer ? t('config.unsaved') : t('config.localEdits')}
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
                    <button
                      onClick={handleDeploy}
                      disabled={!isDirty || deploying}
                      title={t('config.deployHint')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Rocket size={12} />
                      {deploying ? t('config.deploying') : t('config.deploy')}
                    </button>
                  )}
                  <button
                    onClick={handleDiscardChanges}
                    disabled={!isDirty || deploying}
                    title={isOfficer ? t('config.discardHint') : t('config.resetHint')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw size={12} />
                    {isOfficer ? t('config.discard') : t('config.reset')}
                  </button>
                  {!isOfficer && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {t('config.sandboxHint')}
                    </span>
                  )}
                  {deployError && <span className="text-xs text-red-400">{deployError}</span>}
                </div>
              </div>

              {/* Global settings card — band thresholds + ranked cutoff */}
              <div className="mb-6 rounded-xl bg-[var(--background)] border border-[var(--border)] p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Global Settings</h3>

                {/* Band thresholds */}
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Power Band Thresholds
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Where the boundaries fall between μT4, mT4, sT4, and T5. Applied to scoring, KP targets, and the model player view.
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-sky-400">μT4 / mT4</span>
                      <PowerInput
                        value={config.microMidThreshold}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, microMidThreshold: Math.max(0, v) }))
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-teal-400">mT4 / sT4</span>
                      <PowerInput
                        value={config.midStrongThreshold}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, midStrongThreshold: Math.max(0, v) }))
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-fuchsia-400">sT4 / T5</span>
                      <PowerInput
                        value={config.strongT5Threshold}
                        onChange={(v) =>
                          setConfig((c) => ({ ...c, strongT5Threshold: Math.max(0, v) }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Ranked cutoff */}
                <div>
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Ranked Cutoff
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Who gets scored vs tagged UNRANKED. Choose a mode:
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Mode toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, rankedMode: 'topN' }))}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                          config.rankedMode === 'topN'
                            ? 'bg-[#4318ff] text-white'
                            : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        Top N by Power
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, rankedMode: 'minPower' }))}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                          config.rankedMode === 'minPower'
                            ? 'bg-[#4318ff] text-white'
                            : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        Minimum Power
                      </button>
                    </div>

                    {/* Mode-specific input */}
                    {config.rankedMode === 'topN' ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--text-secondary)]">Rank the top</span>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={config.rankedTopN}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v) && v > 0) setConfig((c) => ({ ...c, rankedTopN: v }));
                          }}
                          className="w-20 px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm tabular-nums text-[var(--foreground)] text-center focus:outline-none focus:border-[var(--foreground)]/30"
                        />
                        <span className="text-[var(--text-secondary)]">players by power</span>
                        {scored.length > 0 && (() => {
                          const sorted = [...scored].sort((a, b) => b.power - a.power);
                          const cutoffPlayer = sorted[Math.min(config.rankedTopN - 1, sorted.length - 1)];
                          return (
                            <span className="text-xs text-[var(--text-muted)] ml-1">
                              (cutoff ≈ {(cutoffPlayer.power / 1_000_000).toFixed(1)}M power)
                            </span>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--text-secondary)]">Rank players with ≥</span>
                        <PowerInput
                          value={config.rankedMinPower}
                          onChange={(v) => setConfig((c) => ({ ...c, rankedMinPower: Math.max(0, v) }))}
                        />
                        <span className="text-[var(--text-secondary)]">power</span>
                        {scored.length > 0 && (
                          <span className="text-xs text-[var(--text-muted)] ml-1">
                            ({scored.filter((p) => p.power >= config.rankedMinPower).length} of {scored.length} ranked)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Everyone outside the cutoff is tagged UNRANKED and hidden from the table by default.
                  </p>
                </div>
              </div>

              {/* How Scoring Works — comprehensive visual guide */}
              <div className="mb-6 rounded-xl bg-[var(--background)] border border-[var(--border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  <h3 className="text-base font-semibold text-[var(--foreground)]">{t('guide.title')}</h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">{t('guide.subtitle')}</p>
                </div>

                <div className="px-5 py-5 space-y-6">
                  {/* Step 1: Bands */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center text-xs font-bold">1</span>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">{t('guide.step1Title')}</h4>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] ml-9 mb-3">
                      {t('guide.step1Body', {
                        mt4: 'mT4',
                        t5: 'T5',
                      })}
                    </p>
                    <div className="ml-9 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-sky-500/20 border border-sky-500/30 py-2 px-3">
                        <div className="text-sm font-bold text-sky-400">μT4</div>
                        <div className="text-xs text-[var(--text-muted)]">&lt; {(config.microMidThreshold / 1_000_000).toFixed(0)}M</div>
                      </div>
                      <div className="rounded-lg bg-teal-500/20 border border-teal-500/30 py-2 px-3">
                        <div className="text-sm font-bold text-teal-400">mT4</div>
                        <div className="text-xs text-[var(--text-muted)]">{(config.microMidThreshold / 1_000_000).toFixed(0)}–{(config.midStrongThreshold / 1_000_000).toFixed(0)}M</div>
                      </div>
                      <div className="rounded-lg bg-emerald-500/20 border border-emerald-500/30 py-2 px-3">
                        <div className="text-sm font-bold text-emerald-400">sT4</div>
                        <div className="text-xs text-[var(--text-muted)]">{(config.midStrongThreshold / 1_000_000).toFixed(0)}–{(config.strongT5Threshold / 1_000_000).toFixed(0)}M</div>
                      </div>
                      <div className="rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 py-2 px-3">
                        <div className="text-sm font-bold text-fuchsia-400">T5</div>
                        <div className="text-xs text-[var(--text-muted)]">≥ {(config.strongT5Threshold / 1_000_000).toFixed(0)}M</div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Formula */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-bold">2</span>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">{t('guide.step2Title')}</h4>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] ml-9">{t('guide.step2Body')}</p>
                  </div>

                  {/* Step 3: Normalization */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-fuchsia-500/15 text-fuchsia-400 flex items-center justify-center text-xs font-bold">3</span>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">{t('guide.step3Title')}</h4>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] ml-9">{t('guide.step3Body')}</p>
                  </div>

                  {/* Step 4: Score */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/15 text-violet-400 flex items-center justify-center text-xs font-bold">4</span>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">{t('guide.step4Title')}</h4>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] ml-9">{t('guide.step4Body')}</p>
                  </div>

                  {/* Step 5: Status */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-xs font-bold">5</span>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">{t('guide.step5Title')}</h4>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] ml-9 mb-3">{t('guide.step5Body')}</p>
                    <div className="ml-9 flex flex-wrap gap-2 text-xs">
                      <span className={`px-3 py-1 rounded-full border ${STATUS_STYLES.EXCELLENT}`}>{t('status.excellent')}</span>
                      <span className="text-[var(--text-muted)] self-center">→</span>
                      <span className={`px-3 py-1 rounded-full border ${STATUS_STYLES.APPROVED}`}>{t('status.strong')}</span>
                      <span className="text-[var(--text-muted)] self-center">→</span>
                      <span className={`px-3 py-1 rounded-full border ${STATUS_STYLES.GOOD}`}>{t('status.good')}</span>
                      <span className="text-[var(--text-muted)] self-center">→</span>
                      <span className={`px-3 py-1 rounded-full border ${STATUS_STYLES.REJECTED}`}>{isOfficer ? t('status.review') : t('status.low')}</span>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] ml-9 mt-3">
                      Players outside the top 400 by power are tagged{' '}
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${STATUS_STYLES.UNRANKED}`}>UNRANKED</span>
                      {' '}— they are not scored or ranked, and are not flagged for review.
                    </p>
                  </div>

                  {/* KP Target note */}
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 flex items-start gap-3">
                    <Info size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[var(--text-secondary)]">{t('guide.kpNote')}</p>
                  </div>
                </div>
              </div>

              {/* Four columns, one per band */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 items-start mt-4">
                <BandColumn
                  band="microT4"
                  formula={config.formulaMicroT4}
                  cutoffs={config.cutoffsMicroT4}
                  kpTarget={config.kpTargetMicroT4}
                  powerRangeLabel={`Under ${(config.microMidThreshold / 1_000_000).toFixed(0)}M`}
                  examplePower={Math.max(5_000_000, Math.round(config.microMidThreshold / 2 / 5_000_000) * 5_000_000)}
                  isOfficer={isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaMicroT4', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsMicroT4', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetMicroT4: v }))}
                />
                <BandColumn
                  band="midT4"
                  formula={config.formulaMidT4}
                  cutoffs={config.cutoffsMidT4}
                  kpTarget={config.kpTargetMidT4}
                  powerRangeLabel={`${(config.microMidThreshold / 1_000_000).toFixed(0)}–${(config.midStrongThreshold / 1_000_000).toFixed(0)}M`}
                  examplePower={Math.max(5_000_000, Math.round((config.microMidThreshold + config.midStrongThreshold) / 2 / 5_000_000) * 5_000_000)}
                  isOfficer={isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaMidT4', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsMidT4', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetMidT4: v }))}
                />
                <BandColumn
                  band="strongT4"
                  formula={config.formulaStrongT4}
                  cutoffs={config.cutoffsStrongT4}
                  kpTarget={config.kpTargetStrongT4}
                  powerRangeLabel={`${(config.midStrongThreshold / 1_000_000).toFixed(0)}–${(config.strongT5Threshold / 1_000_000).toFixed(0)}M`}
                  examplePower={Math.max(5_000_000, Math.round((config.midStrongThreshold + config.strongT5Threshold) / 2 / 5_000_000) * 5_000_000)}
                  isOfficer={isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaStrongT4', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsStrongT4', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetStrongT4: v }))}
                />
                <BandColumn
                  band="t5"
                  formula={config.formulaT5}
                  cutoffs={config.cutoffsT5}
                  kpTarget={config.kpTargetT5}
                  powerRangeLabel={`≥ ${(config.strongT5Threshold / 1_000_000).toFixed(0)}M`}
                  examplePower={Math.max(5_000_000, Math.round(config.strongT5Threshold * 1.5 / 5_000_000) * 5_000_000)}
                  isOfficer={isOfficer}
                  onFormulaChange={(k, v) => setFormula('formulaT5', k, v)}
                  onCutoffChange={(k, v) => setCutoff('cutoffsT5', k, v)}
                  onKpTargetChange={(v) => setConfig((c) => ({ ...c, kpTargetT5: v }))}
                />
              </div>
            </div>
          )}
        </section>

        {/* Search + view toggle + result count */}
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
          {/* Result count */}
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {filtered.length} / {scored.length}
          </span>
          {/* View toggle — clean pill, no distracting animation */}
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--background-card)] p-0.5">
            <button
              type="button"
              onClick={() => setModelView(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                !modelView
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {t('view.raw')}
            </button>
            <button
              type="button"
              onClick={() => setModelView(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                modelView
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              <Sparkles size={12} />
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

        {/* Status filter pills + power band legend */}
        <section className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1 flex-wrap">
            {(['ALL', 'EXCELLENT', 'APPROVED', 'GOOD', 'REJECTED', 'UNRANKED'] as const).map((s) => {
              const labelMap: Record<string, string> = {
                ALL: t('status.all'),
                EXCELLENT: t('status.excellent'),
                APPROVED: t('status.strong'),
                GOOD: t('status.good'),
                REJECTED: isOfficer ? t('status.review') : t('status.low'),
                UNRANKED: STATUS_LABELS.UNRANKED,
              };
              const label = labelMap[s] ?? s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    statusFilter === s
                      ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]'
                      : 'bg-[var(--background-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* Show Gov ID toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showGovId}
              onChange={(e) => setShowGovId(e.target.checked)}
              className="accent-[#4318ff]"
            />
            Gov ID
          </label>
          {/* Hide unranked toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideUnranked}
              onChange={(e) => setHideUnranked(e.target.checked)}
              className="accent-[#4318ff]"
            />
            Hide unranked
            <Tooltip content={
              config.rankedMode === 'topN'
                ? `Only the top ${config.rankedTopN} players by power are ranked. Everyone else is UNRANKED.`
                : `Players with power ≥ ${(config.rankedMinPower / 1_000_000).toFixed(0)}M are ranked. Everyone else is UNRANKED.`
            }>
              <span className="cursor-help text-[var(--text-muted)] hover:text-[var(--foreground)]">
                <Info size={12} />
              </span>
            </Tooltip>
          </label>
          {/* Power band legend */}
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-sky-400">μT4</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-teal-400">mT4</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">sT4</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
              <span className="text-fuchsia-400">T5</span>
            </span>
            <span className="text-[var(--text-muted)]">|</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">KP ≥100%</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-400">80–99%</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-400">&lt;80%</span>
            </span>
          </div>
        </section>

        {/* Column toggles — desktop only */}
        <section className="mb-3 hidden sm:flex flex-wrap gap-2">
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
        </section>

        {modelInfoOpen && <ModelExplainer onClose={() => setModelInfoOpen(false)} />}

        {/* Table */}
        <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
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
                  {isOfficer && (
                    <th className="px-1 py-3 w-8" title="Flag for migration" />
                  )}
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
                    className={`border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors ${
                      isOfficer && flaggedForMigration.has(p.characterId) ? 'bg-rose-500/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-right text-[var(--text-muted)] tabular-nums">
                      {globalRankById.get(p.characterId)}
                    </td>
                    {isOfficer && (
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleFlagged(p.characterId)}
                          className={`p-1 rounded transition-colors ${
                            flaggedForMigration.has(p.characterId)
                              ? 'text-rose-400 hover:text-rose-300'
                              : 'text-[var(--text-muted)]/30 hover:text-rose-400'
                          }`}
                          title={flaggedForMigration.has(p.characterId) ? 'Unflag for migration' : 'Flag for migration'}
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M2 1a1 1 0 0 1 1 1v1h9.5a.5.5 0 0 1 .4.8L10.5 7l2.4 3.2a.5.5 0 0 1-.4.8H3v4a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1z"/>
                          </svg>
                        </button>
                      </td>
                    )}
                    {COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${c.numeric ? 'text-right tabular-nums' : ''}`}
                      >
                        {renderCell(p, c.key, modelView, showGovId, isOfficer)}
                      </td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={visibleCols.size + 1 + (isOfficer ? 1 : 0)}
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
        </>)}

        {/* ===== SIMPLE RATIO MODE ===== */}
        {scoringMode === 'simple' && (
          <>
            {/* Simple-mode config */}
            <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] overflow-hidden">
              <div className="px-4 sm:px-5 py-3 flex items-center gap-3 border-b border-[var(--border)]">
                <Settings2 size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">Simple Ratio Scoring</h2>
                    {!isOfficer && (
                      <span className="text-[10px] font-normal text-[var(--text-muted)] uppercase tracking-wider">
                        sandbox
                      </span>
                    )}
                    {isDirty && (
                      <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                        {isOfficer ? '• unsaved' : '• local edits'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    DKP = T4K·{config.simpleFormula.t4Kill} + T5K·{config.simpleFormula.t5Kill} + T4D·{config.simpleFormula.t4Death} + T5D·{config.simpleFormula.t5Death}. Pass when DKP ≥ power × {config.simpleMultiplier}.
                  </p>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                {/* Deploy/reset buttons */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {isOfficer && (
                    <button
                      onClick={handleDeploy}
                      disabled={!isDirty || deploying}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Rocket size={12} />
                      {deploying ? 'Deploying…' : 'Confirm for everyone'}
                    </button>
                  )}
                  <button
                    onClick={handleDiscardChanges}
                    disabled={!isDirty || deploying}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw size={12} />
                    {isOfficer ? 'Discard' : 'Reset to officer settings'}
                  </button>
                  {deployError && <span className="text-xs text-red-400">{deployError}</span>}
                </div>

                {/* Weights grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {(['t4Kill', 't5Kill', 't4Death', 't5Death'] as const).map((k) => {
                    const labels: Record<typeof k, string> = { t4Kill: 'T4 kill', t5Kill: 'T5 kill', t4Death: 'T4 death', t5Death: 'T5 death' } as const;
                    return (
                      <div key={k}>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">{labels[k]}</label>
                        <NumberDraftInput
                          value={config.simpleFormula[k]}
                          onChange={(v) => setConfig((c) => ({ ...c, simpleFormula: { ...c.simpleFormula, [k]: v } }))}
                          className="w-full px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm tabular-nums text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                        />
                      </div>
                    );
                  })}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Power multiplier</label>
                    <NumberDraftInput
                      value={config.simpleMultiplier}
                      onChange={(v) => setConfig((c) => ({ ...c, simpleMultiplier: v }))}
                      className="w-full px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm tabular-nums text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Search */}
            <section className="mb-3 space-y-2">
              {/* Search */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('filters.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={simpleHideOutsideTop}
                    onChange={(e) => setSimpleHideOutsideTop(e.target.checked)}
                    className="accent-[#4318ff]"
                  />
                  Top {config.rankedTopN}
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] select-none">
                  Min
                  <input
                    type="text"
                    inputMode="decimal"
                    value={simpleMinPowerInput}
                    onChange={(e) => setSimpleMinPowerInput(e.target.value)}
                    placeholder="0"
                    className="w-14 px-1.5 py-0.5 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                    title="Hide players below this power (in millions). Blank = no floor."
                  />
                  M
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showGovId}
                    onChange={(e) => setShowGovId(e.target.checked)}
                    className="accent-[#4318ff]"
                  />
                  Gov ID
                </label>
                <span className="text-xs text-[var(--text-muted)]">{simpleFiltered.length} shown</span>
                <span className="text-xs text-[var(--text-muted)] sm:ml-auto">
                  Goal: DKP ≥ power × <span className="font-mono text-[var(--text-secondary)]">{config.simpleMultiplier}</span>
                </span>
              </div>
            </section>

            {/* Simple-mode table */}
            <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
              <div className="overflow-y-auto overflow-x-hidden rounded-xl max-h-[calc(100vh-180px)]">
                <table className="w-full text-sm table-fixed">
                  <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                    <tr>
                      <th className="px-1 sm:px-3 py-2 text-right w-8 sm:w-10">#</th>
                      {isOfficer && (
                        <th className="px-1 py-2 w-8">
                          <button
                            type="button"
                            title="Sort by emigration flag"
                            onClick={() => {
                              if (simpleSortKey === 'flagged') {
                                setSimpleSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setSimpleSortKey('flagged');
                                setSimpleSortDir('desc');
                              }
                            }}
                            className={`inline-flex items-center justify-center p-0.5 hover:text-[var(--foreground)] transition-colors ${simpleSortKey === 'flagged' ? 'text-[var(--foreground)]' : 'text-[var(--text-muted)]'}`}
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                              <path d="M2 1a1 1 0 0 1 1 1v1h9.5a.5.5 0 0 1 .4.8L10.5 7l2.4 3.2a.5.5 0 0 1-.4.8H3v4a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1z"/>
                            </svg>
                            {simpleSortKey === 'flagged' && <span className="text-[9px] ml-0.5">{simpleSortDir === 'asc' ? '▲' : '▼'}</span>}
                          </button>
                        </th>
                      )}
                      {(([
                        { key: 'name' as const, label: 'Name', align: 'text-left', hide: '' },
                        { key: 'power' as const, label: 'Power', align: 'text-right', hide: '' },
                        { key: 't4Kills' as const, label: 'T4K', align: 'text-right', hide: 'hidden md:table-cell' },
                        { key: 't5Kills' as const, label: 'T5K', align: 'text-right', hide: 'hidden md:table-cell' },
                        { key: 't4Deaths' as const, label: 'T4D', align: 'text-right', hide: 'hidden md:table-cell' },
                        { key: 't5Deaths' as const, label: 'T5D', align: 'text-right', hide: 'hidden md:table-cell' },
                        { key: 'kp' as const, label: 'KP', align: 'text-right', hide: 'hidden lg:table-cell' },
                        { key: 'dkp' as const, label: 'DKP', align: 'text-right', hide: '' },
                        { key: 'ratio' as const, label: 'Ratio', align: 'text-right', hide: '' },
                        ...(isOfficer ? [{ key: 'status' as const, label: 'Status', align: 'text-center', hide: '' }] : []),
                      ])).map((col) => {
                        const active = simpleSortKey === col.key;
                        return (
                          <th key={col.key} className={`px-2 sm:px-3 py-2 ${col.align} ${col.hide}`}>
                            <button
                              type="button"
                              onClick={() => {
                                if (simpleSortKey === col.key) {
                                  setSimpleSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                                } else {
                                  setSimpleSortKey(col.key);
                                  setSimpleSortDir(col.key === 'name' ? 'asc' : 'desc');
                                }
                              }}
                              className={`inline-flex items-center gap-0.5 hover:text-[var(--foreground)] transition-colors ${active ? 'text-[var(--foreground)]' : ''}`}
                            >
                              {col.label}
                              {active && <span className="text-[9px]">{simpleSortDir === 'asc' ? '▲' : '▼'}</span>}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {simpleFiltered.map((p) => (
                      <tr key={p.characterId} className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
                        <td className="px-1 sm:px-3 py-2 text-right text-[var(--text-muted)] tabular-nums text-xs sm:text-sm">{simpleRankById.get(p.characterId)}</td>
                        {isOfficer && (
                          <td className="px-1 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => toggleFlagged(p.characterId)}
                              className={`p-1 rounded transition-colors ${
                                flaggedForMigration.has(p.characterId)
                                  ? 'text-rose-400 hover:text-rose-300'
                                  : 'text-[var(--text-muted)]/30 hover:text-rose-400'
                              }`}
                              title={flaggedForMigration.has(p.characterId) ? 'Unflag for emigration' : 'Flag for emigration'}
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M2 1a1 1 0 0 1 1 1v1h9.5a.5.5 0 0 1 .4.8L10.5 7l2.4 3.2a.5.5 0 0 1-.4.8H3v4a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1z"/>
                              </svg>
                            </button>
                          </td>
                        )}
                        <td className="px-2 sm:px-3 py-2 text-left">
                          <PlayerNameCell name={p.username} govId={p.characterId} showGovId={showGovId} />
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {fmtM(p.power)}
                        </td>
                        <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
                          {fmtM(p.t4Kills)}
                        </td>
                        <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
                          {fmtM(p.t5Kills)}
                        </td>
                        <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
                          {fmtM(p.t4Deaths)}
                        </td>
                        <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
                          {fmtM(p.t5Deaths)}
                        </td>
                        <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
                          {fmtM(p.totalKP)}
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {fmtM(Math.round(p.simpleDkp))}
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {p.simpleRatio.toFixed(2)}×
                        </td>
                        {isOfficer && (
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                p.simpleStatus === 'PASS'
                                  ? 'bg-green-500/15 text-green-400 border-green-500/30'
                                  : STATUS_STYLES.REJECTED
                              }`}
                            >
                              {p.simpleStatus === 'PASS' ? 'PASS' : 'BELOW'}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                    {simpleFiltered.length === 0 && (
                      <tr>
                        <td colSpan={isOfficer ? 12 : 9} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                          {loadingDefault ? t('filters.loading') : t('filters.noPlayers')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
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
            <div className="ml-11 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
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
            <div className="ml-11 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-sm text-[var(--text-secondary)] leading-relaxed">
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
  microT4: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  midT4: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  strongT4: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  t5: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

/** Player name cell: name with copy icon, expandable gov ID with its own copy icon. */
function PlayerNameCell({ name, govId, showGovId }: { name: string; govId: number; showGovId: boolean }) {
  const [copiedName, setCopiedName] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const copy = async (text: string, setCb: (v: boolean) => void) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCb(true);
    setTimeout(() => setCb(false), 1500);
  };
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--foreground)] font-medium">{name}</span>
        <button
          type="button"
          onClick={() => copy(name, setCopiedName)}
          className={`p-0.5 rounded transition-colors ${copiedName ? 'text-emerald-400' : 'text-[var(--text-muted)]/40 hover:text-[var(--foreground)]'}`}
          title="Copy name"
        >
          {copiedName ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M3 8.5l3 3 7-7" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M4 2a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2V4h8a2 2 0 0 0-2-2H4zm2 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6z"/></svg>
          )}
        </button>
      </div>
      {showGovId && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-[var(--text-muted)]">{govId}</span>
          <button
            type="button"
            onClick={() => copy(String(govId), setCopiedId)}
            className={`p-0.5 rounded transition-colors ${copiedId ? 'text-emerald-400' : 'text-[var(--text-muted)]/40 hover:text-[var(--foreground)]'}`}
            title="Copy Gov ID"
          >
            {copiedId ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M3 8.5l3 3 7-7" /></svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M4 2a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2V4h8a2 2 0 0 0-2-2H4zm2 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6z"/></svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function renderCell(
  p: ScoredPlayer,
  key: ColumnDef['key'],
  modelView: boolean,
  showGovId: boolean,
  isOfficer: boolean,
) {
  switch (key) {
    case 'username':
      return <PlayerNameCell name={p.username} govId={p.characterId} showGovId={showGovId} />;
    case 'power': {
      // Power keeps its raw value — the band IS the power category, so it doesn't get normalized.
      // Instead, the band membership is shown as a colored pill next to the value.
      const powerCls =
        p.band === 'microT4'
          ? 'text-sky-400'
          : p.band === 'midT4'
            ? 'text-teal-400'
            : p.band === 'strongT4'
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
      return <span className={modelView ? DIM : ''}>{fmtMClamped(p.t4Deaths)}</span>;
    case 't5Deaths':
      return <span className={modelView ? DIM : ''}>{fmtMClamped(p.t5Deaths)}</span>;
    case 'totalDeaths':
      return <span className={modelView ? DIM : ''}>{fmtMClamped(p.t4Deaths + p.t5Deaths)}</span>;
    case 'dkp': {
      const v = p.dkp || p.computedDkp;
      if (modelView) return ratioCell(v, p.modelStats.computedDkp);
      return (
        <Tooltip
          content={`DKP = T4K×w + T5K×w + T4D×w + T5D×w (combat only, using ${BAND_LABELS[p.band]} band weights). This number is separate from the Score — Score uses all 7 components.`}
        >
          <span className="cursor-help">{fmtM(v)}</span>
        </Tooltip>
      );
    }
    case 'finalScore': {
      return (
        <span className={`font-semibold ${STATUS_TEXT[p.status]}`}>
          {fmtScore(p.bandScore)}
        </span>
      );
    }
    case 'status': {
      const statusHints: Record<Status, string> = {
        EXCELLENT: `Top of the ${BAND_LABELS[p.band]} band (score ${fmtScore(p.bandScore)})`,
        APPROVED: `Strong performer in ${BAND_LABELS[p.band]} band (score ${fmtScore(p.bandScore)})`,
        GOOD: `Meeting expectations for ${BAND_LABELS[p.band]} band (score ${fmtScore(p.bandScore)})`,
        REJECTED: isOfficer
          ? `Below the GOOD cutoff for ${BAND_LABELS[p.band]} band — flagged for officer review (score ${fmtScore(p.bandScore)})`
          : `Below the GOOD cutoff for ${BAND_LABELS[p.band]} band (score ${fmtScore(p.bandScore)})`,
        UNRANKED: `Outside the top 400 by power — not scored or ranked. These accounts are not actively tracked for performance.`,
      };
      return (
        <Tooltip content={statusHints[p.status]}>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${STATUS_STYLES[p.status]}`}
          >
            {statusLabel(p.status, isOfficer)}
          </span>
        </Tooltip>
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
          <div className="w-full max-w-sm rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
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
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
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
    <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
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
          className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
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
  subvalue,
  tone,
}: {
  label: string;
  value: string;
  /** Optional muted second line — e.g. 'of N total' when the primary value is filtered. */
  subvalue?: string;
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
    <div className="p-3 sm:p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 truncate">
        {label}
      </div>
      <div className={`text-lg sm:text-xl font-semibold ${toneClass} tabular-nums`}>{value}</div>
      {subvalue && <div className="text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5">{subvalue}</div>}
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
        className="w-full px-2.5 py-2 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-base tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
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
      KP ×{config.kpTargetMicroT4.toFixed(1)}/×{config.kpTargetMidT4.toFixed(1)}/×{config.kpTargetStrongT4.toFixed(1)}/×
      {config.kpTargetT5.toFixed(1)} @ {(config.microMidThreshold / 1_000_000).toFixed(0)}M /{' '}
      {(config.midStrongThreshold / 1_000_000).toFixed(0)}M / {(config.strongT5Threshold / 1_000_000).toFixed(0)}M
      {' • '}
      <span className="text-amber-400/80">≥{Math.round(cuts.excellent)}</span>{' '}
      <span className="text-emerald-400/80">≥{Math.round(cuts.approved)}</span>{' '}
      <span className="text-sky-400/80">≥{Math.round(cuts.good)}</span>
    </span>
  );
}

/** Power input shown/edited in millions (e.g. "40" → 40,000,000). */
/** A plain numeric input that keeps a local text draft so typing is never blocked. */
function NumberDraftInput({
  value,
  onChange,
  className,
  step = 0.1,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  step?: number;
  min?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseFloat(raw);
        if (!Number.isNaN(n) && n >= min) onChange(n);
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (Number.isNaN(n) || n < min) setText(String(value));
        else setText(String(n));
      }}
      step={step}
      className={className}
    />
  );
}

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
    <div className="inline-flex items-center rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] focus-within:border-[var(--foreground)]/30 overflow-hidden">
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

/** Color per formula key — non-translatable. */
const FORMULA_COLORS: Record<FormulaKey, string> = {
  t4Kill: 'bg-violet-400',
  t5Kill: 'bg-violet-600',
  t4Death: 'bg-rose-400',
  t5Death: 'bg-rose-600',
  rss: 'bg-amber-500',
  helps: 'bg-sky-500',
  honor: 'bg-emerald-500',
};

/** Translation key mapping for each formula component's label and hint. */
const FORMULA_LABEL_KEYS: Record<FormulaKey, { label: string; hint: string }> = {
  t4Kill: { label: 'formulaMeta.t4KillLabel', hint: 'formulaMeta.t4KillHint' },
  t5Kill: { label: 'formulaMeta.t5KillLabel', hint: 'formulaMeta.t5KillHint' },
  t4Death: { label: 'formulaMeta.t4DeathLabel', hint: 'formulaMeta.t4DeathHint' },
  t5Death: { label: 'formulaMeta.t5DeathLabel', hint: 'formulaMeta.t5DeathHint' },
  rss: { label: 'formulaMeta.rssLabel', hint: 'formulaMeta.rssHint' },
  helps: { label: 'formulaMeta.helpsLabel', hint: 'formulaMeta.helpsHint' },
  honor: { label: 'formulaMeta.honorLabel', hint: 'formulaMeta.honorHint' },
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
  const t = useTranslations('dkp');
  const keys = FORMULA_LABEL_KEYS[formulaKey];
  const color = FORMULA_COLORS[formulaKey];
  const label = t(keys.label as 'formulaMeta.t4KillLabel');
  const hint = t(keys.hint as 'formulaMeta.t4KillHint');
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
      className={`flex items-center gap-3 py-2 ${disabled ? 'opacity-70' : ''} ${isOff ? 'opacity-40' : ''}`}
    >
      <Tooltip content={hint} className="w-20 xl:w-24 flex-shrink-0">
        <span className="flex items-center gap-1.5 cursor-help">
          <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />
          <span className="text-xs font-medium text-[var(--foreground)] underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2 truncate">
            {label}
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
        className="w-12 px-1 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
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
  isOfficer = true,
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
  isOfficer?: boolean;
}) {
  const t = useTranslations('dkp.bandColumn');
  const tf = useTranslations('dkp');
  // Color palette per band — used on the header strip and accents.
  const palette: Record<Band, { headerBg: string; border: string; text: string; ring: string }> = {
    microT4: {
      headerBg: 'bg-sky-500/20',
      border: 'border-sky-500/30',
      text: 'text-sky-400',
      ring: 'ring-sky-500/20',
    },
    midT4: {
      headerBg: 'bg-teal-500/20',
      border: 'border-teal-500/30',
      text: 'text-teal-400',
      ring: 'ring-teal-500/20',
    },
    strongT4: {
      headerBg: 'bg-emerald-500/20',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      ring: 'ring-emerald-500/20',
    },
    t5: {
      headerBg: 'bg-fuchsia-500/20',
      border: 'border-fuchsia-500/30',
      text: 'text-fuchsia-400',
      ring: 'ring-fuchsia-500/20',
    },
  };
  const c = palette[band];
  const total = FORMULA_KEYS.reduce((s, k) => s + formula[k], 0);
  const exP = (examplePower / 1_000_000).toFixed(0);
  const exKP = ((examplePower * kpTarget) / 1_000_000).toFixed(0);
  return (
    <div
      className={`rounded-xl border ${c.border} bg-[var(--background-card)] flex flex-col`}
    >
      {/* Band header */}
      <div className={`${c.headerBg} px-5 py-4 border-b ${c.border}`}>
        <div className={`text-lg font-bold ${c.text}`}>{BAND_LABELS[band]}</div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5">{powerRangeLabel}</div>
      </div>

      {/* KP Target */}
      <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
          {t('kpTargetTitle')}
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {t('kpTargetHelp')}
        </p>
        <div className="flex items-end gap-4">
          <BaselineInput
            label={t('kpTargetLabel')}
            hint={t('kpTargetHint', { example: exP, target: exKP })}
            value={kpTarget}
            step={0.5}
            decimals={1}
            disabled={disabled}
            onChange={onKpTargetChange}
          />
          <div className="pb-1 text-sm text-[var(--text-muted)] whitespace-nowrap">
            <span className={`font-semibold ${c.text}`}>{t('playerArrow', { power: exP, kp: exKP })}</span>
          </div>
        </div>
      </div>

      {/* Score Formula */}
      <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
        <div className="mb-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              {t('formulaTitle')}
            </div>
            {total > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--background-secondary)] text-[var(--text-muted)]">
                {t('formulaActive', { n: FORMULA_KEYS.filter((k) => formula[k] > 0).length })}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {t('formulaHelp')}
          </p>
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
          <div
            className="mt-3 pt-3 border-t border-[var(--border)]/40 text-xs text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1 cursor-help"
            title="Effective share: shows what percentage of this band's final score each component actually contributes. Calculated as each weight ÷ sum of all weights. Components set to 0 don't appear."
          >
            {FORMULA_KEYS.map((k) => {
              if (formula[k] <= 0) return null;
              return (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${FORMULA_COLORS[k]}`} />
                  <span>{tf(FORMULA_LABEL_KEYS[k].label as 'formulaMeta.t4KillLabel')}</span>
                  <span className="text-[var(--text-secondary)] font-medium">
                    {Math.round((formula[k] / total) * 100)}%
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Cutoffs */}
      <div className="px-5 pt-5 pb-5">
        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
          {t('cutoffsTitle')}
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {t('cutoffsHelp')}
        </p>
        <div className="space-y-2">
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
          <div className="flex items-center gap-3 pt-1">
            <span
              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES.REJECTED} flex-shrink-0`}
            >
              {statusLabel('REJECTED', isOfficer)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {t('cutoffsBelow', { n: Math.round(cutoffs.good) })}
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
    <div className={`flex items-center gap-3 py-2 ${disabled ? 'opacity-70' : ''}`}>
      <Tooltip content={CUTOFF_HINTS[cutoffKey]} className="flex-shrink-0">
        <span
          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${STATUS_STYLES[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </Tooltip>
      <span className="text-sm text-[var(--text-muted)] hidden sm:inline">≥</span>
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
        className="w-12 px-1 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
      />
    </div>
  );
}

