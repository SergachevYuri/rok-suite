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
} from 'lucide-react';
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
  // When split is true, `weightsLow` is used for players with highestPower < weightSplitThreshold,
  // otherwise `weightsHigh` is used. When split is false, `weightsHigh` is used for everyone.
  split: boolean;
  weightSplitThreshold: number;
  weightsLow: WeightSet;
  weightsHigh: WeightSet;
  dkpFormula: DkpFormula;
  meta: {
    dkpDivisor: number;
    rssMultiplier: number;
    helpsMultiplier: number;
    honorMultiplier: number;
  };
  statusThresholds: { excellent: number; approved: number; good: number };
}

// Weights are relative integers in [0, 100]. They do NOT need to sum to anything;
// the final score divides by the sum of active weights. Larger numbers just dominate.
const DEFAULT_WEIGHTS: WeightSet = { dkp: 80, rss: 5, helps: 5, honor: 10 };
const DEFAULT_DKP_FORMULA: DkpFormula = { t4Kill: 5, t5Kill: 10, t4Death: 8, t5Death: 24 };

const DEFAULT_CONFIG: Config = {
  split: false,
  weightSplitThreshold: 40_000_000,
  weightsLow: { ...DEFAULT_WEIGHTS },
  weightsHigh: { ...DEFAULT_WEIGHTS },
  dkpFormula: { ...DEFAULT_DKP_FORMULA },
  meta: {
    dkpDivisor: 4,
    rssMultiplier: 3.0,
    helpsMultiplier: 0.0003,
    honorMultiplier: 0.001,
  },
  statusThresholds: { excellent: 1.5, approved: 1.0, good: 0.8 },
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

/** Merge a partial remote config onto a base, preserving nested defaults. */
function mergeConfig(base: Config, partial: Partial<Config> | null | undefined): Config {
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    weightsLow: { ...base.weightsLow, ...migrateWeights(partial.weightsLow) },
    weightsHigh: { ...base.weightsHigh, ...migrateWeights(partial.weightsHigh) },
    dkpFormula: { ...base.dkpFormula, ...(partial.dkpFormula ?? {}) },
    statusThresholds: { ...base.statusThresholds, ...(partial.statusThresholds ?? {}) },
    meta: { ...base.meta, ...(partial.meta ?? {}) },
  };
}

type Status = 'EXCELLENT' | 'APPROVED' | 'GOOD' | 'REJECTED';

interface ScoredPlayer extends Player {
  computedDkp: number;
  scoreDkp: number;
  scoreRss: number;
  scoreHelps: number;
  scoreHonor: number;
  finalScore: number;
  status: Status;
}

function safeDiv(a: number, b: number): number {
  if (!b || b <= 0) return 0;
  return a / b;
}

function computeScores(players: Player[], config: Config): ScoredPlayer[] {
  const { meta, statusThresholds, dkpFormula } = config;
  return players.map((p) => {
    const computedDkp =
      p.t4Kills * dkpFormula.t4Kill +
      p.t5Kills * dkpFormula.t5Kill +
      p.t4Deaths * dkpFormula.t4Death +
      p.t5Deaths * dkpFormula.t5Death;
    const metaDkp = p.highestPower / meta.dkpDivisor;
    const metaRss = p.highestPower * meta.rssMultiplier;
    const metaHelps = p.highestPower * meta.helpsMultiplier;
    const metaHonor = p.highestPower * meta.honorMultiplier;

    const scoreDkp = safeDiv(computedDkp, metaDkp);
    const scoreRss = safeDiv(p.rssGathered, metaRss);
    const scoreHelps = safeDiv(p.allianceHelps, metaHelps);
    const scoreHonor = safeDiv(p.honorPoints, metaHonor);

    const weights =
      config.split && p.highestPower < config.weightSplitThreshold
        ? config.weightsLow
        : config.weightsHigh;

    let num = 0;
    let den = 0;
    const components: [number, number][] = [
      [scoreDkp, weights.dkp],
      [scoreRss, weights.rss],
      [scoreHelps, weights.helps],
      [scoreHonor, weights.honor],
    ];
    for (const [s, w] of components) {
      if (w > 0) {
        num += s * w;
        den += w;
      }
    }
    const finalScore = den > 0 ? num / den : 0;

    let status: Status;
    if (finalScore >= statusThresholds.excellent) status = 'EXCELLENT';
    else if (finalScore >= statusThresholds.approved) status = 'APPROVED';
    else if (finalScore >= statusThresholds.good) status = 'GOOD';
    else status = 'REJECTED';

    return {
      ...p,
      computedDkp,
      scoreDkp,
      scoreRss,
      scoreHelps,
      scoreHonor,
      finalScore,
      status,
    };
  });
}

const nf = new Intl.NumberFormat('en-US');
const fmt = (n: number) => nf.format(Math.round(n));
const fmt2 = (n: number) => n.toFixed(2);

const STATUS_STYLES: Record<Status, string> = {
  EXCELLENT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  GOOD: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
};

type SortKey =
  | 'username'
  | 'power'
  | 'totalKP'
  | 'dkp'
  | 'finalScore'
  | 'scoreDkp'
  | 'scoreRss'
  | 'scoreHelps'
  | 'scoreHonor'
  | 'honorPoints';

interface ColumnDef {
  key: SortKey | 'status';
  label: string;
  numeric?: boolean;
  defaultVisible: boolean;
  hint?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Player', defaultVisible: true, hint: 'In-game username from the kingdom export.' },
  { key: 'power', label: 'Power', numeric: true, defaultVisible: true, hint: 'Current power as of the last upload.' },
  { key: 'totalKP', label: 'KP', numeric: true, defaultVisible: true, hint: 'Total kill points from the kingdom export (all tiers combined).' },
  { key: 'dkp', label: 'DKP', numeric: true, defaultVisible: true, hint: 'Raw DKP for this player from the formula above (T4/T5 kills + T4/T5 deaths).' },
  { key: 'finalScore', label: 'Final', numeric: true, defaultVisible: true, hint: 'Final weighted score that determines the status tier.' },
  { key: 'status', label: 'Status', defaultVisible: true, hint: 'Tier the final score lands in (EXCELLENT / APPROVED / GOOD / REJECTED).' },
  { key: 'scoreDkp', label: 'sDKP', numeric: true, defaultVisible: true, hint: 'DKP sub-score = raw DKP ÷ expected DKP for this player\'s power. 1.00 = exactly meeting expectation.' },
  { key: 'scoreRss', label: 'sRSS', numeric: true, defaultVisible: true, hint: 'RSS sub-score = resources gathered ÷ expected. 1.00 = on target for their power.' },
  { key: 'scoreHelps', label: 'sHelps', numeric: true, defaultVisible: true, hint: 'Alliance helps sub-score = helps given ÷ expected. 1.00 = on target for their power.' },
  { key: 'scoreHonor', label: 'sHonor', numeric: true, defaultVisible: false, hint: 'Honor sub-score = honor points ÷ expected. 1.00 = on target for their power.' },
  { key: 'honorPoints', label: 'Honor', numeric: true, defaultVisible: false, hint: 'Raw honor points from the Statmaster honor file (matched by name).' },
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

  const setWeight = (band: 'weightsLow' | 'weightsHigh', key: keyof WeightSet, value: number) => {
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
              Kingdom 3923
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">
              3923 Kingdom DKP Score
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {dataset?.statsFileName ? (
                <>Source: {dataset.statsFileName}{dataset.honorFileName ? ` + ${dataset.honorFileName}` : ''}</>
              ) : (
                'Loading…'
              )}
              {dataset?.uploadedBy && <> • uploaded by {dataset.uploadedBy}</>}
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
          <SummaryCard label="Players" value={fmt(summary.total)} />
          <SummaryCard label="Total DKP" value={fmt(summary.totalDkp)} />
          <SummaryCard label="Excellent" value={fmt(summary.counts.EXCELLENT)} tone="amber" />
          <SummaryCard label="Approved" value={fmt(summary.counts.APPROVED)} tone="emerald" />
          <SummaryCard label="Good" value={fmt(summary.counts.GOOD)} tone="sky" />
          <SummaryCard label="Rejected" value={fmt(summary.counts.REJECTED)} tone="red" />
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
                  Scoring Configuration
                </h2>
                {!isOfficer && (
                  <span className="text-[10px] font-normal text-[var(--text-muted)] uppercase tracking-wider">
                    read-only
                  </span>
                )}
                {isOfficer && isDirty && (
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                    • unsaved
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
                        title="Publish your current edits to the shared kingdom database — every viewer will see them on next refresh."
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Rocket size={12} />
                        {deploying ? 'Deploying…' : 'Confirm for everyone'}
                      </button>
                      <button
                        onClick={handleDiscardChanges}
                        disabled={!isDirty || deploying}
                        title="Throw away your local edits and revert to the published config."
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <RotateCcw size={12} />
                        Discard
                      </button>
                      {deployError && <span className="text-xs text-red-400">{deployError}</span>}
                    </>
                  )}
                </div>
                <label
                  title="Use two separate weight sets — one for accounts under the power threshold, one for accounts at or above. Lets you score smaller accounts differently than whales."
                  className={`flex items-center gap-2 text-xs text-[var(--text-muted)] select-none ${isOfficer ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <input
                    type="checkbox"
                    checked={config.split}
                    disabled={!isOfficer}
                    onChange={(e) => setConfig((c) => ({ ...c, split: e.target.checked }))}
                    className="accent-[#4318ff]"
                  />
                  Split weights by power
                </label>
              </div>

              {config.split && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-medium">Power threshold:</span>
                  <PowerInput
                    value={config.weightSplitThreshold}
                    disabled={!isOfficer}
                    onChange={(v) =>
                      setConfig((c) => ({ ...c, weightSplitThreshold: Math.max(0, v) }))
                    }
                  />
                  <span className="text-[var(--text-muted)]">splits low / high power accounts</span>
                </div>
              )}

              {/* Quick how-it-works explainer */}
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-[var(--background)]/40 border border-[var(--border)] text-xs text-[var(--text-secondary)] leading-relaxed">
                <Info size={14} className="text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--foreground)]">How it works:</span>{' '}
                  Each player&apos;s raw stats are normalized against their own power so smaller
                  accounts that punch above their weight score higher.{' '}
                  <span className="text-[var(--text-muted)]">
                    DKP combines kills + deaths via the formula → each category becomes a
                    sub-score (actual ÷ expected) → sub-scores are blended using the weights →
                    the final number maps to a status tier. Hover any{' '}
                    <span className="underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
                      dotted label
                    </span>{' '}
                    for details.
                  </span>
                </div>
              </div>

              {/* 3-column grid: Formula | Weights | Cutoffs (stacks on mobile) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* DKP Formula card */}
                <ConfigCard
                  title="DKP Formula"
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

                {/* Weights card(s) */}
                <ConfigCard
                  title="Score Weights"
                  hint="How much each sub-score contributes to the final number. Values are relative — they don't need to add to anything."
                  rightSlot={
                    <span className="text-[10px] text-[var(--text-muted)]">
                      relative — don&apos;t add up
                    </span>
                  }
                >
                  <div className="space-y-3">
                    {config.split && (
                      <WeightBand
                        title="Smaller accounts"
                        subtitle={`Under ${(config.weightSplitThreshold / 1_000_000).toFixed(0)}M power`}
                        weights={config.weightsLow}
                        disabled={!isOfficer}
                        onChange={(k, v) => setWeight('weightsLow', k, v)}
                      />
                    )}
                    <WeightBand
                      title={config.split ? 'Larger accounts' : 'All players'}
                      subtitle={
                        config.split
                          ? `At or above ${(config.weightSplitThreshold / 1_000_000).toFixed(0)}M power`
                          : 'Applied uniformly to every player'
                      }
                      weights={config.weightsHigh}
                      disabled={!isOfficer}
                      onChange={(k, v) => setWeight('weightsHigh', k, v)}
                    />
                  </div>
                </ConfigCard>

                {/* Status cutoffs card */}
                <ConfigCard
                  title="Status Cutoffs"
                  hint="The minimum final score needed to land in each tier. Anything below the GOOD cutoff is REJECTED."
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
                  </div>
                </ConfigCard>
              </div>
            </div>
          )}
        </section>

        {/* Filters */}
        <section className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or gov ID…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['ALL', 'EXCELLENT', 'APPROVED', 'GOOD', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  statusFilter === s
                    ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]'
                    : 'bg-[var(--background-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--foreground)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Column toggles */}
        <section className="mb-3 flex flex-wrap gap-2">
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
              {c.label}
            </button>
          ))}
        </section>

        {/* Table */}
        <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
          <div className="overflow-auto rounded-xl max-h-[calc(100vh-180px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th
                    className="px-3 py-3 text-right w-12 cursor-help"
                    title="Global rank by current sort. Search/filter does not renumber."
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
                        {c.label}
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
                        {renderCell(p, c.key)}
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
                      {loadingDefault ? 'Loading…' : 'No players match.'}
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

function renderCell(p: ScoredPlayer, key: ColumnDef['key']) {
  switch (key) {
    case 'username':
      return <span className="text-[var(--foreground)] font-medium">{p.username}</span>;
    case 'power':
      return fmt(p.power);
    case 'totalKP':
      return fmt(p.totalKP);
    case 'dkp':
      return fmt(p.dkp || p.computedDkp);
    case 'finalScore':
      return <span className="font-semibold text-[var(--foreground)]">{fmt2(p.finalScore)}</span>;
    case 'status':
      return (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[p.status]}`}
        >
          {p.status}
        </span>
      );
    case 'scoreDkp':
      return fmt2(p.scoreDkp);
    case 'scoreRss':
      return fmt2(p.scoreRss);
    case 'scoreHelps':
      return fmt2(p.scoreHelps);
    case 'scoreHonor':
      return fmt2(p.scoreHonor);
    case 'honorPoints':
      return fmt(p.honorPoints);
    default:
      return null;
  }
}

function OfficerBadge() {
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
          title="Sign out"
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
        <Lock size={12} /> Officer sign in
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Angmar officer sign in</h3>
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
                  setError('Incorrect password');
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
                <label className="text-xs text-[var(--text-muted)]">Your name (optional)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Officer password</label>
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
                Sign in
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
      setError('Kingdom stats file is required.');
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
        `Loaded ${players.length} players${honor.length ? ` • ${matched}/${honor.length} honor matches` : ''}.`,
      );
      setStatsFile(null);
      setHonorFile(null);
      if (statsRef.current) statsRef.current.value = '';
      if (honorRef.current) honorRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse files.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Upload size={14} /> Upload new dataset
        </h2>
        {currentDataset?.uploadedAt && (
          <button
            onClick={onReset}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
          >
            Reset to default
          </button>
        )}
      </div>
      <div className="mb-4 space-y-2 text-xs text-[var(--text-muted)]">
        <p>
          Uploads are saved to the shared kingdom database — everyone sees the new dataset
          immediately.
        </p>
        <p>
          <span className="font-semibold text-amber-400">Date range must start March 13</span>{' '}
          and end on the most recent day available.
        </p>
        <p>
          <span className="font-medium text-[var(--text-secondary)]">Kingdom stats:</span>{' '}
          full kingdom export with <em>all options selected</em>.{' '}
          <span className="font-medium text-[var(--text-secondary)]">Honor points:</span>{' '}
          honor rankings export from Statmaster.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileInput
          label="Kingdom stats (.xlsx)"
          inputRef={statsRef}
          file={statsFile}
          onChange={setStatsFile}
          accept=".xlsx"
        />
        <FileInput
          label="Honor rankings (.xlsx, optional)"
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
          {busy ? 'Processing…' : 'Process & load'}
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
  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
        >
          Choose file
        </button>
        <span className="text-xs text-[var(--text-muted)] truncate">
          {file ? file.name : 'No file selected'}
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[var(--foreground)] uppercase tracking-wider">
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
        <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1 cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
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
        className="w-full px-2 py-1.5 rounded bg-[var(--background)] border border-[var(--border)] text-sm tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** Compact one-liner summary of the active config for the collapsed panel. */
function ConfigSummaryLine({ config }: { config: Config }) {
  const w = config.weightsHigh;
  const cuts = config.statusThresholds;
  return (
    <span>
      DKP {Math.round(w.dkp)} • RSS {Math.round(w.rss)} • Helps {Math.round(w.helps)} • Honor{' '}
      {Math.round(w.honor)}
      {config.split && (
        <> • split @ {(config.weightSplitThreshold / 1_000_000).toFixed(0)}M</>
      )}
      {' • '}
      <span className="text-amber-400/80">≥{cuts.excellent.toFixed(2)}</span>{' '}
      <span className="text-emerald-400/80">≥{cuts.approved.toFixed(2)}</span>{' '}
      <span className="text-sky-400/80">≥{cuts.good.toFixed(2)}</span>
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
  APPROVED: 'Players hitting at least this threshold are APPROVED (meeting expectations).',
  GOOD: 'Players hitting at least this threshold are GOOD (acceptable). Below this they are REJECTED.',
  REJECTED: '',
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
      <Tooltip content={meta.hint} className="w-20 sm:w-24 flex-shrink-0">
        <span className="flex items-center gap-2 cursor-help">
          <span className={`w-2 h-2 rounded-full ${meta.color}`} />
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
          className="w-14 pl-1.5 pr-4 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
          %
        </span>
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/40 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <div className="text-xs font-semibold text-[var(--foreground)]">{title}</div>
          {subtitle && (
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{subtitle}</div>
          )}
        </div>
        <div
          className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider tabular-nums"
          title="Weights are relative — they don't need to add to anything"
        >
          relative sum {Math.round(total)}
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
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => {
    setText(value.toFixed(2));
  }, [value]);
  const commit = () => {
    const n = parseFloat(text);
    if (Number.isNaN(n)) {
      setText(value.toFixed(2));
      return;
    }
    const c = clamp(n, 0, 3);
    onChange(c);
    setText(c.toFixed(2));
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
          {status}
        </span>
      </Tooltip>
      <span className="text-xs text-[var(--text-muted)] hidden sm:inline">≥</span>
      <input
        type="range"
        min={0}
        max={3}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`flex-1 ${accentClass} disabled:cursor-not-allowed h-2`}
      />
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={3}
        step={0.05}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-14 px-1.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed flex-shrink-0"
      />
    </div>
  );
}
