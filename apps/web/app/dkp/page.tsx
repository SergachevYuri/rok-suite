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

interface Config {
  // Power level (in raw units) below which players are considered "smaller accounts"
  // and use the lower multiplier. At-or-above this value uses the higher multiplier.
  powerThreshold: number;
  // Smaller accounts: target KP = power × this. Default 3 means a 30M-power player is
  // expected to produce 90M total KP.
  lowMultiplier: number;
  // Larger accounts: target KP = power × this. Default 10 means a 60M-power player is
  // expected to produce 600M total KP. Larger accounts have more troops to throw at KvK.
  highMultiplier: number;
  // Score thresholds (as ratios of KP / target). 1.0 = exactly meeting target.
  statusThresholds: { excellent: number; approved: number; good: number };
}

const DEFAULT_CONFIG: Config = {
  powerThreshold: 42_000_000,
  lowMultiplier: 3,
  highMultiplier: 10,
  statusThresholds: { excellent: 1.2, approved: 1.0, good: 0.8 },
};

/** Merge a partial remote config onto a base, preserving nested defaults.
 *  Legacy fields from older configs (weights, formula, baselines) are silently ignored. */
function mergeConfig(base: Config, partial: Partial<Config> | null | undefined): Config {
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    statusThresholds: { ...base.statusThresholds, ...(partial.statusThresholds ?? {}) },
  };
}

type Status = 'EXCELLENT' | 'APPROVED' | 'GOOD' | 'REJECTED';

interface ScoredPlayer extends Player {
  /** What this player should produce in KP based on their power. */
  targetKp: number;
  /** Actual total KP ÷ target. 1.0 = exactly meeting expectations. */
  kpRatio: number;
  status: Status;
}

function safeDiv(a: number, b: number): number {
  if (!b || b <= 0) return 0;
  return a / b;
}

function computeScores(players: Player[], config: Config): ScoredPlayer[] {
  const { powerThreshold, lowMultiplier, highMultiplier, statusThresholds } = config;
  return players.map((p) => {
    const multiplier = p.power < powerThreshold ? lowMultiplier : highMultiplier;
    const targetKp = p.power * multiplier;
    const kpRatio = safeDiv(p.totalKP, targetKp);

    let status: Status;
    if (kpRatio >= statusThresholds.excellent) status = 'EXCELLENT';
    else if (kpRatio >= statusThresholds.approved) status = 'APPROVED';
    else if (kpRatio >= statusThresholds.good) status = 'GOOD';
    else status = 'REJECTED';

    return { ...p, targetKp, kpRatio, status };
  });
}

const nf = new Intl.NumberFormat('en-US');
const fmt = (n: number) => nf.format(Math.round(n));
/** Display a sub-score / final score as a percentage (1.00 → "100%"). */
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
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
  | 'totalKP'
  | 'targetKp'
  | 'kpRatio';

interface ColumnDef {
  key: SortKey | 'status';
  label: string;
  numeric?: boolean;
  defaultVisible: boolean;
  hint?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Player', defaultVisible: true, hint: 'In-game username from the kingdom export.' },
  { key: 'power', label: 'Power', numeric: true, defaultVisible: true, hint: 'Current power as of the last upload (not highest power).' },
  { key: 'totalKP', label: 'KP', numeric: true, defaultVisible: true, hint: 'Actual total kill points from the kingdom export (all tiers combined).' },
  { key: 'targetKp', label: 'Target KP', numeric: true, defaultVisible: true, hint: 'Target KP for this player based on their power. Smaller accounts are expected to produce ~3× their power, larger accounts ~10×.' },
  { key: 'kpRatio', label: 'Score', numeric: true, defaultVisible: true, hint: 'Actual KP ÷ Target KP, shown as a percentage. 100% = exactly meeting their target. 150% = 1.5× target.' },
  { key: 'status', label: 'Status', defaultVisible: true, hint: 'Tier the score lands in (EXCELLENT / APPROVED / GOOD / REJECTED) based on the cutoffs in the config panel.' },
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
  const [sortKey, setSortKey] = useState<SortKey>('kpRatio');
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
    let totalKp = 0;
    for (const p of scored) {
      counts[p.status]++;
      totalKp += p.totalKP;
    }
    return { counts, totalKp, total: scored.length };
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
          <SummaryCard label="Total KP" value={fmt(summary.totalKp)} />
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
              </div>

              {/* How it works callout */}
              <div className="mb-5 flex items-start gap-3 p-4 rounded-lg bg-sky-500/5 border border-sky-500/20 text-sm text-[var(--text-secondary)] leading-relaxed">
                <Info size={18} className="text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--foreground)]">How the score works:</span>{' '}
                  Each player has a <span className="text-[var(--foreground)] font-medium">Target KP</span>{' '}
                  computed from their power (smaller accounts use a lower multiplier, larger accounts a
                  higher one). Their <span className="text-[var(--foreground)] font-medium">Score</span>{' '}
                  is just <span className="text-[var(--foreground)] font-medium">actual KP ÷ target KP</span>,
                  shown as a percentage. 100% = exactly hitting their target.
                </div>
              </div>

              {/* 2-column layout: Target KP (with preview) | Status Cutoffs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* Target KP card */}
                <ConfigCard
                  title="Target KP"
                  hint="How much KP each player is expected to produce, based on their current power. Below the threshold uses the smaller multiplier, at-or-above uses the larger one."
                >
                  <div className="space-y-4">
                    {/* Power threshold */}
                    <div>
                      <Tooltip content="Power level that splits 'smaller' and 'larger' accounts. Below this number uses the smaller-account multiplier; at or above uses the larger-account one.">
                        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)] block mb-1.5 cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
                          Power threshold
                        </label>
                      </Tooltip>
                      <div className="flex items-center gap-2">
                        <PowerInput
                          value={config.powerThreshold}
                          disabled={!isOfficer}
                          onChange={(v) =>
                            setConfig((c) => ({ ...c, powerThreshold: Math.max(0, v) }))
                          }
                        />
                        <span className="text-xs text-[var(--text-muted)]">power</span>
                      </div>
                    </div>

                    {/* Two multipliers */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Tooltip
                          content={`Smaller accounts (under ${(config.powerThreshold / 1_000_000).toFixed(0)}M power) are expected to produce this many times their power in KP. Default 3 means a 30M-power player should hit 90M KP.`}
                        >
                          <label className="text-xs uppercase tracking-wider text-[var(--text-muted)] block mb-1.5 cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
                            Smaller account multiplier
                          </label>
                        </Tooltip>
                        <MultiplierInput
                          value={config.lowMultiplier}
                          disabled={!isOfficer}
                          onChange={(v) =>
                            setConfig((c) => ({ ...c, lowMultiplier: Math.max(0, v) }))
                          }
                        />
                        <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                          Under {(config.powerThreshold / 1_000_000).toFixed(0)}M power
                        </p>
                      </div>
                      <div>
                        <Tooltip
                          content={`Larger accounts (at or above ${(config.powerThreshold / 1_000_000).toFixed(0)}M power) are expected to produce this many times their power in KP. Default 10 means a 60M-power player should hit 600M KP.`}
                        >
                          <label className="text-xs uppercase tracking-wider text-[var(--text-muted)] block mb-1.5 cursor-help underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2">
                            Larger account multiplier
                          </label>
                        </Tooltip>
                        <MultiplierInput
                          value={config.highMultiplier}
                          disabled={!isOfficer}
                          onChange={(v) =>
                            setConfig((c) => ({ ...c, highMultiplier: Math.max(0, v) }))
                          }
                        />
                        <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                          {(config.powerThreshold / 1_000_000).toFixed(0)}M power and above
                        </p>
                      </div>
                    </div>

                    {/* Live preview table */}
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 overflow-hidden">
                      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]/50">
                        Target KP at sample power levels
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
                          {[20_000_000, 35_000_000, 50_000_000, 75_000_000, 100_000_000].map(
                            (power) => {
                              const isLow = power < config.powerThreshold;
                              const mult = isLow ? config.lowMultiplier : config.highMultiplier;
                              return (
                                <tr key={power} className="border-t border-[var(--border)]/50">
                                  <td className="text-left px-3 py-2 font-medium text-[var(--foreground)]">
                                    {(power / 1_000_000).toFixed(0)}M
                                  </td>
                                  <td
                                    className={`text-right px-3 py-2 ${isLow ? 'text-sky-400' : 'text-violet-400'}`}
                                  >
                                    ×{mult.toFixed(1)}
                                  </td>
                                  <td className="text-right px-3 py-2 font-medium text-[var(--foreground)]">
                                    {fmtCompact(power * mult)}
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </ConfigCard>

                {/* Status cutoffs card */}
                <ConfigCard
                  title="Status Cutoffs"
                  hint="The minimum Score needed to land in each tier. Anything below the GOOD cutoff is REJECTED."
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
                  <p className="mt-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Players whose Score lands at or above each threshold get that status. Anything
                    below the GOOD cutoff is marked REJECTED.
                  </p>
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
    case 'targetKp':
      return fmt(p.targetKp);
    case 'kpRatio':
      return (
        <span className="font-semibold text-[var(--foreground)]">{fmtPct(p.kpRatio)}</span>
      );
    case 'status':
      return (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[p.status]}`}
        >
          {p.status}
        </span>
      );
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


/** Compact one-liner summary of the active config for the collapsed panel. */
function ConfigSummaryLine({ config }: { config: Config }) {
  const cuts = config.statusThresholds;
  const t = (config.powerThreshold / 1_000_000).toFixed(0);
  return (
    <span>
      Target: ×{config.lowMultiplier.toFixed(1)} below {t}M, ×{config.highMultiplier.toFixed(1)} at/above
      {' • '}
      <span className="text-amber-400/80">≥{Math.round(cuts.excellent * 100)}%</span>{' '}
      <span className="text-emerald-400/80">≥{Math.round(cuts.approved * 100)}%</span>{' '}
      <span className="text-sky-400/80">≥{Math.round(cuts.good * 100)}%</span>
    </span>
  );
}

/** Decimal multiplier input (e.g. 3.0 means "×3 of power"). */
function MultiplierInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value.toFixed(1));
  useEffect(() => {
    setText(value.toFixed(1));
  }, [value]);
  return (
    <div className="inline-flex items-center rounded-lg bg-[var(--background)] border border-[var(--border)] focus-within:border-[var(--foreground)]/30 overflow-hidden">
      <span className="px-2 py-2 text-sm font-semibold text-[var(--text-muted)] border-r border-[var(--border)]">
        ×
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={text}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text);
          if (Number.isNaN(n) || n < 0) {
            setText(value.toFixed(1));
            return;
          }
          onChange(n);
          setText(n.toFixed(1));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-20 px-2 py-2 text-base text-right tabular-nums text-[var(--foreground)] bg-transparent focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
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

const CUTOFF_HINTS: Record<Status, string> = {
  EXCELLENT:
    'Top tier — players whose Score is at or above this threshold are marked EXCELLENT.',
  APPROVED: 'Players hitting at least this threshold are APPROVED (meeting expectations).',
  GOOD: 'Players hitting at least this threshold are GOOD (acceptable). Below this they are REJECTED.',
  REJECTED: '',
};

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
  // Display in percent (100 = 1.00 ratio). Internal storage stays as a ratio.
  const toPct = (v: number) => String(Math.round(v * 100));
  const [text, setText] = useState(toPct(value));
  useEffect(() => {
    setText(toPct(value));
  }, [value]);
  const commit = () => {
    const n = parseFloat(text);
    if (Number.isNaN(n)) {
      setText(toPct(value));
      return;
    }
    const ratio = clamp(n / 100, 0, 3);
    onChange(ratio);
    setText(toPct(ratio));
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
        max={300}
        step={5}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
        className={`flex-1 ${accentClass} disabled:cursor-not-allowed h-2`}
      />
      <div className="relative flex-shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={300}
          step={5}
          value={text}
          disabled={disabled}
          readOnly={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-16 pl-1.5 pr-4 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs tabular-nums text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30 disabled:cursor-not-allowed"
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
          %
        </span>
      </div>
    </div>
  );
}
