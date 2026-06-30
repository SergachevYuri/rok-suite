'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import {
  ArrowUpDown,
  Search,
  Upload,
  X,
  Rocket,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Settings2,
  Plus,
  Trash2,
  Calendar,
} from 'lucide-react';
import { useAuthRole, meetsRole } from '@/lib/auth-role';
import { SignInButton } from '@/components/SignInButton';
import { OUR_SEED_KDS } from '@/lib/kingdom/our-seed';
import {
  type DkpDataset,
  type KvK,
  parseStatsFile,
  mergeIntoPlayers,
  looseMatch,
  loadLatestDataset,
  saveDataset,
  deleteDataset,
  loadConfigRow,
  saveConfigRow,
  subscribeToConfigRow,
  listKvKs,
  createKvK,
  renameKvK,
  archiveKvK,
  unarchiveKvK,
  deleteKvK,
  listKingdomsForKvK,
  simpleConfigIdForKvK,
} from './data';
import {
  type SimpleConfig,
  type SimpleScoredPlayer,
  type SimpleStatus,
  type PowerTier,
  DEFAULT_SIMPLE_CONFIG,
  computeSimpleScores,
  mergeSimpleConfig,
  parseFilenameMeta,
  sortTiersAsc,
} from '@/lib/dkp/simple-scoring';

const SELECTED_KVK_KEY = 'dkp-selected-kvk-v1';
const SELECTED_KD_KEY = 'dkp-selected-kd-v1';

// ─── Formatters ─────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat('en-US');
const fmt = (n: number) => nf.format(Math.round(n));
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
const fmtPct = (r: number) => `${(r * 100).toFixed(0)}%`;

// ─── Status styling ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<SimpleStatus, string> = {
  EXCELLENT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  APPROVED: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  GOOD: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  UNRANKED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const STATUS_LABEL: Record<SimpleStatus, string> = {
  EXCELLENT: 'EXCELLENT',
  APPROVED: 'APPROVED',
  GOOD: 'GOOD',
  REJECTED: 'REJECTED',
  UNRANKED: 'UNRANKED',
};

function ratioColor(r: number, cutoffs: { excellent: number; approved: number; good: number }): string {
  if (r >= cutoffs.excellent) return 'text-emerald-400';
  if (r >= cutoffs.approved) return 'text-cyan-400';
  if (r >= cutoffs.good) return 'text-amber-400';
  return 'text-rose-400';
}

// ─── Sort keys ──────────────────────────────────────────────────────────────

type SortKey =
  | 'rank'
  | 'username'
  | 'power'
  | 'tier'
  | 't4Deaths'
  | 't5Deaths'
  | 't4Kills'
  | 't5Kills'
  | 'totalKP'
  | 'dkp'
  | 'dkpRatio'
  | 'totalDeaths'
  | 'deathsRatio'
  | 'ratio'
  | 'status';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DkpPage() {
  return (
    <AppSidebar>
      <DkpPageInner />
    </AppSidebar>
  );
}

function DkpPageInner() {
  const { role } = useAuthRole();
  // Officer-or-higher gates writes (upload, deploy, manage KvKs).
  const isOfficer = meetsRole(role, ['admin', 'officer']);
  const uploaderTag = role ?? null;

  // ─── KvK + Kingdom scope ────────────────────────────────────────────────
  const [kvks, setKvks] = useState<KvK[]>([]);
  const [loadingKvks, setLoadingKvks] = useState(true);
  const [selectedKvkId, setSelectedKvkIdState] = useState<string | null>(null);
  const [selectedKingdomId, setSelectedKingdomIdState] = useState<number | null>(null);
  const [extraKds, setExtraKds] = useState<number[]>([]);
  const [kvkManagerOpen, setKvkManagerOpen] = useState(false);

  const setSelectedKvkId = (id: string | null) => {
    setSelectedKvkIdState(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(SELECTED_KVK_KEY, id);
      else localStorage.removeItem(SELECTED_KVK_KEY);
    }
  };
  const setSelectedKingdomId = (id: number | null) => {
    setSelectedKingdomIdState(id);
    if (typeof window !== 'undefined') {
      if (id != null) localStorage.setItem(SELECTED_KD_KEY, String(id));
      else localStorage.removeItem(SELECTED_KD_KEY);
    }
  };

  const selectedKvk = kvks.find((k) => k.id === selectedKvkId) ?? null;
  const allKds = useMemo(() => {
    const set = new Set<number>([...OUR_SEED_KDS, ...extraKds]);
    return [...set].sort((a, b) => a - b);
  }, [extraKds]);

  // Restore selection from localStorage; otherwise pick first active KvK.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listKvKs(true);
      if (cancelled) return;
      setKvks(list);
      setLoadingKvks(false);
      const storedKvk = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_KVK_KEY) : null;
      const storedKd = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_KD_KEY) : null;
      const stillExists = storedKvk && list.some((k) => k.id === storedKvk);
      if (stillExists) {
        setSelectedKvkIdState(storedKvk);
      } else {
        const firstActive = list.find((k) => !k.archivedAt) ?? list[0] ?? null;
        if (firstActive) setSelectedKvkIdState(firstActive.id);
      }
      if (storedKd) {
        const n = parseInt(storedKd, 10);
        if (Number.isFinite(n)) setSelectedKingdomIdState(n);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh the KvK list (used after create / rename / archive).
  const refreshKvks = async () => {
    const list = await listKvKs(true);
    setKvks(list);
    return list;
  };

  // Load the list of kingdoms that already have data in the selected KvK.
  useEffect(() => {
    if (!selectedKvkId) {
      setExtraKds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = await listKingdomsForKvK(selectedKvkId);
      if (!cancelled) setExtraKds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedKvkId]);

  // ─── Dataset + config ───────────────────────────────────────────────────
  const [dataset, setDataset] = useState<DkpDataset | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(false);

  /** Working copy of the config (officer edits). */
  const [config, setConfig] = useState<SimpleConfig>(DEFAULT_SIMPLE_CONFIG);
  /** Last config deployed to everyone (read from Supabase). */
  const [publishedConfig, setPublishedConfig] = useState<SimpleConfig>(DEFAULT_SIMPLE_CONFIG);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ratio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<SimpleStatus | 'ALL'>('ALL');
  const [tierFilter, setTierFilter] = useState<string | 'ALL'>('ALL');
  const [showGovId, setShowGovId] = useState(false);

  const configRowId = selectedKvkId ? simpleConfigIdForKvK(selectedKvkId) : null;

  // ─── Load shared config + subscribe (per KvK) ──────────────────────────
  useEffect(() => {
    if (!configRowId) {
      setConfig(DEFAULT_SIMPLE_CONFIG);
      setPublishedConfig(DEFAULT_SIMPLE_CONFIG);
      return;
    }
    let cancelled = false;
    (async () => {
      const remote = await loadConfigRow<Partial<SimpleConfig>>(configRowId);
      if (cancelled) return;
      const merged = mergeSimpleConfig(DEFAULT_SIMPLE_CONFIG, remote);
      setPublishedConfig(merged);
      if (!dirtyRef.current) setConfig(merged);
    })();
    const unsub = subscribeToConfigRow<Partial<SimpleConfig>>(configRowId, (remote) => {
      const merged = mergeSimpleConfig(DEFAULT_SIMPLE_CONFIG, remote);
      setPublishedConfig(merged);
      if (!dirtyRef.current) setConfig(merged);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [configRowId]);

  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(publishedConfig),
    [config, publishedConfig],
  );
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  // ─── Load latest dataset on KvK/KD change ──────────────────────────────
  const reloadDataset = async () => {
    if (!selectedKvkId || selectedKingdomId == null) {
      setDataset(null);
      return;
    }
    setLoadingDataset(true);
    try {
      const latest = await loadLatestDataset({ kvkId: selectedKvkId, kingdomId: selectedKingdomId });
      setDataset(latest);
    } catch (e) {
      console.error('Failed to load dataset', e);
    } finally {
      setLoadingDataset(false);
    }
  };
  useEffect(() => {
    reloadDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKvkId, selectedKingdomId]);

  const players = dataset?.players ?? [];
  const dateRange = useMemo(
    () => (dataset?.statsFileName ? parseFilenameMeta(dataset.statsFileName) : null),
    [dataset?.statsFileName],
  );

  // ─── Scoring ────────────────────────────────────────────────────────────
  const scored = useMemo<SimpleScoredPlayer[]>(
    () => computeSimpleScores(players, config),
    [players, config],
  );

  // Stable rank by current sort, before search filter.
  const ranked = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = [...scored];
    arr.sort((a, b) => compareScored(a, b, sortKey) * dir);
    return arr;
  }, [scored, sortKey, sortDir]);

  const rankById = useMemo(() => {
    const m = new Map<number, number>();
    ranked.forEach((p, i) => m.set(p.characterId, i + 1));
    return m;
  }, [ranked]);

  const filtered = useMemo(() => {
    let list = ranked;
    if (statusFilter !== 'ALL') list = list.filter((p) => p.status === statusFilter);
    if (tierFilter !== 'ALL') list = list.filter((p) => p.tier?.id === tierFilter);
    if (search.trim()) {
      const q = search.trim();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(
        (p) =>
          looseMatch(p.username, q) ||
          (qDigits.length >= 3 && String(p.characterId).includes(qDigits)),
      );
    }
    return list;
  }, [ranked, search, statusFilter, tierFilter]);

  const summary = useMemo(() => {
    const counts: Record<SimpleStatus, number> = {
      EXCELLENT: 0,
      APPROVED: 0,
      GOOD: 0,
      REJECTED: 0,
      UNRANKED: 0,
    };
    let totalDkp = 0;
    for (const p of scored) {
      counts[p.status]++;
      totalDkp += p.dkp;
    }
    return { counts, total: scored.length, totalDkp };
  }, [scored]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'username' ? 'asc' : 'desc');
    }
  };

  const handleDeploy = async () => {
    if (!configRowId) return;
    setDeploying(true);
    setDeployError(null);
    try {
      const tidied: SimpleConfig = { ...config, tiers: sortTiersAsc(config.tiers) };
      await saveConfigRow(configRowId, tidied);
      setConfig(tidied);
      setPublishedConfig(tidied);
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Failed to deploy');
    } finally {
      setDeploying(false);
    }
  };

  const handleDiscard = () => {
    setConfig(publishedConfig);
    setDeployError(null);
  };

  const handleResetToDefaults = () => {
    setConfig(DEFAULT_SIMPLE_CONFIG);
  };

  const handleDatasetUploaded = async (
    newDataset: DkpDataset,
    targetKingdomId: number,
  ) => {
    if (!selectedKvkId) throw new Error('Pick a KvK first');
    const saved = await saveDataset({
      ...newDataset,
      uploadedBy: uploaderTag,
      kvkId: selectedKvkId,
      kingdomId: targetKingdomId,
    });
    // Refresh the KD list (in case this kingdom is new for this KvK) and
    // make sure the selector points at the kingdom we just uploaded.
    if (!extraKds.includes(targetKingdomId)) {
      setExtraKds([...extraKds, targetKingdomId].sort((a, b) => a - b));
    }
    if (selectedKingdomId !== targetKingdomId) {
      setSelectedKingdomId(targetKingdomId);
    } else {
      setDataset(saved);
    }
  };

  const handleResetDataset = async () => {
    if (!dataset?.id) return;
    try {
      await deleteDataset(dataset.id);
      await reloadDataset();
    } catch (e) {
      console.error('Failed to delete dataset', e);
    }
  };

  const hasKvk = selectedKvkId != null;
  const hasKd = selectedKingdomId != null;

  return (
    <div className="min-h-screen">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2 tracking-wide uppercase">
              Performance
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">
              DKP Tracker
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {selectedKvk
                ? `${selectedKvk.name}${selectedKvk.archivedAt ? ' · archived' : ''}`
                : 'Pick a KvK to get started'}
              {hasKd ? ` · Kingdom ${selectedKingdomId}` : ''}
              {dataset?.statsFileName ? ` · ${dataset.statsFileName}` : ''}
            </p>
          </div>
          <SignInButton />
        </header>

        {/* KvK + Kingdom selectors */}
        <section className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              KvK
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedKvkId ?? ''}
                onChange={(e) => setSelectedKvkId(e.target.value || null)}
                disabled={loadingKvks || kvks.length === 0}
                className="min-w-[180px] px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-40"
              >
                {kvks.length === 0 && <option value="">— none —</option>}
                {kvks.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                    {k.archivedAt ? ' · archived' : ''}
                  </option>
                ))}
              </select>
              {isOfficer && (
                <button
                  type="button"
                  onClick={() => setKvkManagerOpen(true)}
                  className="px-2.5 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                  title="Manage KvKs"
                >
                  <Settings2 size={14} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              Kingdom
            </label>
            <select
              value={selectedKingdomId ?? ''}
              onChange={(e) => setSelectedKingdomId(e.target.value ? parseInt(e.target.value, 10) : null)}
              disabled={!hasKvk}
              className="min-w-[140px] px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-40"
            >
              <option value="">— pick one —</option>
              {allKds.map((kd) => (
                <option key={kd} value={kd}>
                  KD {kd}
                  {extraKds.includes(kd) ? ' · has data' : ''}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* No-KvK CTA */}
        {!loadingKvks && !hasKvk && (
          <section className="mb-6 p-8 rounded-xl bg-[var(--background-card)] border border-dashed border-[var(--border)] text-center">
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              {kvks.length === 0
                ? 'No KvK created yet. Each KvK has its own scoring config and scans.'
                : 'Pick a KvK above to view its data.'}
            </p>
            {isOfficer && kvks.length === 0 && (
              <button
                onClick={() => setKvkManagerOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] transition-colors"
              >
                <Plus size={14} /> Create your first KvK
              </button>
            )}
          </section>
        )}

        {hasKvk && hasKd && (
          <>
            {/* Officer-only upload panel */}
            {isOfficer && (
              <UploadPanel
                onUploaded={handleDatasetUploaded}
                onReset={handleResetDataset}
                currentDataset={dataset}
                defaultKingdomId={selectedKingdomId}
                allKds={allKds}
              />
            )}

            {/* Active dataset card */}
            {dataset && (
              <section className="mb-6 p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-[var(--text-muted)]" />
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Period</p>
                    {dateRange ? (
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {dateRange.start} → {dateRange.end}
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          ({dateRange.days} day{dateRange.days === 1 ? '' : 's'})
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">unknown (filename has no YYYYMMDD_YYYYMMDD)</p>
                    )}
                  </div>
                </div>
                <div className="h-8 w-px bg-[var(--border)]" />
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Players</p>
                  <p className="text-sm font-medium text-[var(--foreground)]">{fmt(players.length)}</p>
                </div>
                {dataset.uploadedAt && (
                  <>
                    <div className="h-8 w-px bg-[var(--border)]" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Uploaded</p>
                      <p className="text-sm text-[var(--foreground)]">{new Date(dataset.uploadedAt).toLocaleString()}</p>
                    </div>
                  </>
                )}
              </section>
            )}

            {!dataset && !loadingDataset && (
              <section className="mb-6 p-6 rounded-xl bg-[var(--background-card)] border border-dashed border-[var(--border)] text-center">
                <p className="text-sm text-[var(--text-secondary)]">
                  No scan uploaded yet for {selectedKvk?.name} · KD {selectedKingdomId}.
                </p>
              </section>
            )}

            {/* Summary cards */}
            <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-6">
              <SummaryCard label="Players" value={fmt(summary.total)} />
              <SummaryCard label="Total DKP" value={fmt(summary.totalDkp)} />
              <SummaryCard label="Excellent" value={fmt(summary.counts.EXCELLENT)} tone="excellent" />
              <SummaryCard label="Approved" value={fmt(summary.counts.APPROVED)} tone="approved" />
              <SummaryCard label="Good" value={fmt(summary.counts.GOOD)} tone="good" />
              <SummaryCard label="Rejected" value={fmt(summary.counts.REJECTED)} tone="review" />
            </section>

            {/* Config panel */}
            <ConfigPanel
              open={configOpen}
              setOpen={setConfigOpen}
              config={config}
              setConfig={setConfig}
              isDirty={isDirty}
              isOfficer={isOfficer}
              deploying={deploying}
              deployError={deployError}
              onDeploy={handleDeploy}
              onDiscard={handleDiscard}
              onResetDefaults={handleResetToDefaults}
            />

            {/* Filters */}
            <section className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or ID…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SimpleStatus | 'ALL')}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              >
                <option value="ALL">All statuses</option>
                <option value="EXCELLENT">Excellent</option>
                <option value="APPROVED">Approved</option>
                <option value="GOOD">Good</option>
                <option value="REJECTED">Rejected</option>
                <option value="UNRANKED">Unranked</option>
              </select>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              >
                <option value="ALL">All tiers</option>
                {sortTiersAsc(config.tiers).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} · ≥{fmtM(t.minPower)}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showGovId}
                  onChange={(e) => setShowGovId(e.target.checked)}
                  className="accent-[#4318ff]"
                />
                Show IDs
              </label>
            </section>

            {/* Players table */}
            <PlayersTable
              rows={filtered}
              rankById={rankById}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              cutoffs={config.cutoffs}
              showGovId={showGovId}
            />
          </>
        )}
      </div>

      {kvkManagerOpen && (
        <KvkManagerModal
          kvks={kvks}
          onClose={() => setKvkManagerOpen(false)}
          onChanged={async () => {
            const list = await refreshKvks();
            // If the currently-selected KvK was deleted, jump to the first active one.
            if (selectedKvkId && !list.some((k) => k.id === selectedKvkId)) {
              const firstActive = list.find((k) => !k.archivedAt) ?? list[0] ?? null;
              setSelectedKvkId(firstActive?.id ?? null);
            }
            // If there's no selection but a KvK now exists, auto-select it.
            if (!selectedKvkId && list.length > 0) {
              const firstActive = list.find((k) => !k.archivedAt) ?? list[0] ?? null;
              if (firstActive) setSelectedKvkId(firstActive.id);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Compare ─────────────────────────────────────────────────────────────

function compareScored(a: SimpleScoredPlayer, b: SimpleScoredPlayer, key: SortKey): number {
  switch (key) {
    case 'rank':
      return 0;
    case 'username':
      return a.username.localeCompare(b.username);
    case 'power':
      return a.power - b.power;
    case 'tier': {
      const am = a.tier?.minPower ?? -1;
      const bm = b.tier?.minPower ?? -1;
      return am - bm;
    }
    case 't4Deaths':
      return a.t4Deaths - b.t4Deaths;
    case 't5Deaths':
      return a.t5Deaths - b.t5Deaths;
    case 't4Kills':
      return a.t4Kills - b.t4Kills;
    case 't5Kills':
      return a.t5Kills - b.t5Kills;
    case 'totalKP':
      return a.totalKP - b.totalKP;
    case 'dkp':
      return a.dkp - b.dkp;
    case 'dkpRatio':
      return a.dkpRatio - b.dkpRatio;
    case 'totalDeaths':
      return a.totalDeaths - b.totalDeaths;
    case 'deathsRatio':
      return a.deathsRatio - b.deathsRatio;
    case 'ratio':
      return a.ratio - b.ratio;
    case 'status': {
      const order: Record<SimpleStatus, number> = { EXCELLENT: 4, APPROVED: 3, GOOD: 2, REJECTED: 1, UNRANKED: 0 };
      return order[a.status] - order[b.status];
    }
  }
}

// ─── SummaryCard ─────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  tone?: 'excellent' | 'approved' | 'good' | 'review';
}

function SummaryCard({ label, value, tone }: SummaryCardProps) {
  const toneClass =
    tone === 'excellent'
      ? 'text-emerald-400'
      : tone === 'approved'
        ? 'text-cyan-400'
        : tone === 'good'
          ? 'text-amber-400'
          : tone === 'review'
            ? 'text-rose-400'
            : 'text-[var(--foreground)]';
  return (
    <div className="p-3 sm:p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <p className="text-[10px] sm:text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {label}
      </p>
      <p className={`text-lg sm:text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

// ─── UploadPanel ─────────────────────────────────────────────────────────

function UploadPanel({
  onUploaded,
  onReset,
  currentDataset,
  defaultKingdomId,
  allKds,
}: {
  onUploaded: (d: DkpDataset, kingdomId: number) => Promise<void>;
  onReset: () => void | Promise<void>;
  currentDataset: DkpDataset | null;
  defaultKingdomId: number;
  allKds: number[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kdOverride, setKdOverride] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const filenameMeta = file ? parseFilenameMeta(file.name) : null;
  // Priority: officer override → filename parse → currently-selected KD.
  const effectiveKd = kdOverride ?? filenameMeta?.kingdomId ?? defaultKingdomId;
  const kdOptions = useMemo(() => {
    const set = new Set<number>(allKds);
    if (effectiveKd) set.add(effectiveKd);
    return [...set].sort((a, b) => a - b);
  }, [allKds, effectiveKd]);

  const handleProcess = async () => {
    setError(null);
    setInfo(null);
    if (!file) {
      setError('Pick an .xlsx file first');
      return;
    }
    if (!effectiveKd) {
      setError('Pick a target Kingdom');
      return;
    }
    setBusy(true);
    try {
      const stats = await parseStatsFile(file);
      const players = mergeIntoPlayers(stats, []);
      await onUploaded(
        {
          uploadedAt: new Date().toISOString(),
          uploadedBy: null,
          statsFileName: file.name,
          honorFileName: null,
          players,
        },
        effectiveKd,
      );
      setInfo(`Loaded ${players.length} players → KD ${effectiveKd}`);
      setFile(null);
      setKdOverride(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse the file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Upload size={14} /> Upload XLSX scan
        </h2>
        {currentDataset?.uploadedAt && (
          <button
            onClick={onReset}
            className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors inline-flex items-center gap-1"
          >
            <Trash2 size={12} /> Delete current dataset
          </button>
        )}
      </div>
      <div className="mb-4 space-y-1 text-xs text-[var(--text-muted)]">
        <p>
          File name format:{' '}
          <span className="font-mono text-[var(--text-secondary)]">KDID_YYYYMMDD_YYYYMMDD.xlsx</span>
          {' (e.g. '}
          <span className="font-mono">3923_20260625_20260625.xlsx</span>
          {') — KDID is auto-detected. You can override below.'}
        </p>
        <p>
          Required columns: Character ID, Username, Power, T5 Deaths, T4 Deaths, Total Kill Points, T5 Kills, T4 Kills.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[240px]">
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">File</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
            >
              Choose file
            </button>
            <span className="text-xs text-[var(--text-muted)] truncate">
              {file ? file.name : 'no file selected'}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setKdOverride(null);
              }}
              className="hidden"
            />
          </div>
          {filenameMeta && (
            <p className="mt-1.5 text-xs text-cyan-400">
              Detected: {filenameMeta.kingdomId ? `KD ${filenameMeta.kingdomId} · ` : 'no KD in filename · '}
              {filenameMeta.start} → {filenameMeta.end} ({filenameMeta.days} day{filenameMeta.days === 1 ? '' : 's'})
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">Target Kingdom</label>
          <select
            value={effectiveKd ?? ''}
            onChange={(e) => setKdOverride(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
          >
            {kdOptions.map((kd) => (
              <option key={kd} value={kd}>
                KD {kd}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleProcess}
          disabled={!file || busy}
          className="px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Processing…' : 'Process & save'}
        </button>
        {info && <span className="text-xs text-emerald-400">{info}</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </section>
  );
}

// ─── KvkManagerModal ─────────────────────────────────────────────────────

function KvkManagerModal({
  kvks,
  onClose,
  onChanged,
}: {
  kvks: KvK[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const runOp = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await runOp(async () => {
      await createKvK(newName.trim());
      setNewName('');
    });
  };

  const handleRename = async (id: string) => {
    if (!editDraft.trim()) {
      setEditingId(null);
      return;
    }
    await runOp(async () => {
      await renameKvK(id, editDraft.trim());
      setEditingId(null);
    });
  };

  const handleArchive = async (k: KvK) => {
    await runOp(async () => {
      if (k.archivedAt) await unarchiveKvK(k.id);
      else await archiveKvK(k.id);
    });
  };

  const handleDelete = async (k: KvK) => {
    if (!confirm(`Delete KvK "${k.name}"? This wipes its config AND all uploaded scans for this KvK.`)) return;
    await runOp(async () => {
      await deleteKvK(k.id);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Manage KvKs</h3>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] block mb-1">New KvK name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="KvK 13"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || busy}
            className="px-3 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={14} className="inline" /> Create
          </button>
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="space-y-1">
          {kvks.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No KvKs yet.</p>
          )}
          {kvks.map((k) => (
            <div
              key={k.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                k.archivedAt
                  ? 'bg-[var(--background-secondary)]/40 border-[var(--border)] opacity-70'
                  : 'bg-[var(--background-secondary)] border-[var(--border)]'
              }`}
            >
              {editingId === k.id ? (
                <input
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(k.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 rounded bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)]"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingId(k.id);
                    setEditDraft(k.name);
                  }}
                  className="flex-1 text-left text-sm text-[var(--foreground)] hover:underline"
                  title="Click to rename"
                >
                  {k.name}
                  {k.archivedAt && <span className="ml-2 text-xs text-[var(--text-muted)]">· archived</span>}
                </button>
              )}
              {editingId === k.id ? (
                <button
                  onClick={() => handleRename(k.id)}
                  disabled={busy}
                  className="px-2 py-1 rounded text-xs bg-[#4318ff] text-white hover:bg-[#3a14e0] disabled:opacity-40"
                >
                  Save
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleArchive(k)}
                    disabled={busy}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] px-2 py-1 transition-colors"
                  >
                    {k.archivedAt ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    onClick={() => handleDelete(k)}
                    disabled={busy}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ConfigPanel ─────────────────────────────────────────────────────────

interface ConfigPanelProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  config: SimpleConfig;
  setConfig: React.Dispatch<React.SetStateAction<SimpleConfig>>;
  isDirty: boolean;
  isOfficer: boolean;
  deploying: boolean;
  deployError: string | null;
  onDeploy: () => Promise<void>;
  onDiscard: () => void;
  onResetDefaults: () => void;
}

function ConfigPanel({
  open,
  setOpen,
  config,
  setConfig,
  isDirty,
  isOfficer,
  deploying,
  deployError,
  onDeploy,
  onDiscard,
  onResetDefaults,
}: ConfigPanelProps) {
  const setFormula = (key: keyof SimpleConfig['formula'], value: number) => {
    setConfig((c) => ({ ...c, formula: { ...c.formula, [key]: value } }));
  };
  const setCutoff = (key: keyof SimpleConfig['cutoffs'], value: number) => {
    setConfig((c) => ({ ...c, cutoffs: { ...c.cutoffs, [key]: value } }));
  };
  const updateTier = (id: string, patch: Partial<PowerTier>) => {
    setConfig((c) => ({ ...c, tiers: c.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  };
  const addTier = () => {
    const id = `tier-${Date.now().toString(36)}`;
    const sorted = sortTiersAsc(config.tiers);
    const lastMin = sorted.length > 0 ? sorted[sorted.length - 1].minPower : 0;
    setConfig((c) => ({
      ...c,
      tiers: [
        ...c.tiers,
        {
          id,
          label: `T${c.tiers.length + 1}`,
          minPower: lastMin + 10_000_000,
          targetDkp: 0,
          targetDeaths: 0,
        },
      ],
    }));
  };
  const removeTier = (id: string) => {
    setConfig((c) => ({ ...c, tiers: c.tiers.filter((t) => t.id !== id) }));
  };

  return (
    <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--background-hover)] transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Settings2 size={14} /> Scoring configuration
          {isDirty && isOfficer && (
            <span className="text-xs font-normal text-amber-400">· unsaved changes</span>
          )}
          {isDirty && !isOfficer && (
            <span className="text-xs font-normal text-[var(--text-muted)]">· local preview</span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[var(--border)] space-y-6">
          {!isOfficer && (
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              Read-only — your edits stay local. Officers can deploy a shared config.
            </p>
          )}

          {/* Formula */}
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Formula
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3 font-mono">
              DKP = T5d·<span className="text-emerald-400">X</span> + T4d·<span className="text-emerald-400">Y</span>
              {' '}+ T5k·<span className="text-cyan-400">A</span> + T4k·<span className="text-cyan-400">B</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CoeffInput label="X · T5 deaths" value={config.formula.t5Death} onChange={(v) => setFormula('t5Death', v)} tone="death" />
              <CoeffInput label="Y · T4 deaths" value={config.formula.t4Death} onChange={(v) => setFormula('t4Death', v)} tone="death" />
              <CoeffInput label="A · T5 kills" value={config.formula.t5Kill} onChange={(v) => setFormula('t5Kill', v)} tone="kill" />
              <CoeffInput label="B · T4 kills" value={config.formula.t4Kill} onChange={(v) => setFormula('t4Kill', v)} tone="kill" />
            </div>
          </div>

          {/* Tiers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Power tiers
              </h3>
              <button
                onClick={addTier}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Plus size={12} /> Add tier
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Each player falls into the highest tier whose <em>min power</em> ≤ their power. Power below the lowest tier = unranked.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="text-left py-2 pr-2 font-normal">Label</th>
                    <th className="text-right py-2 px-2 font-normal">Min power</th>
                    <th className="text-right py-2 px-2 font-normal">Target DKP</th>
                    <th className="text-right py-2 px-2 font-normal">Target deaths</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sortTiersAsc(config.tiers).map((t) => (
                    <TierRow key={t.id} tier={t} onChange={(p) => updateTier(t.id, p)} onRemove={() => removeTier(t.id)} canRemove={config.tiers.length > 1} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cutoffs */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Status cutoffs
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Status uses <span className="font-mono">min(DKP%, Deaths%)</span>. Player must hit both targets.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CutoffInput label="Excellent ≥" value={config.cutoffs.excellent} onChange={(v) => setCutoff('excellent', v)} tone="emerald" />
              <CutoffInput label="Approved ≥" value={config.cutoffs.approved} onChange={(v) => setCutoff('approved', v)} tone="cyan" />
              <CutoffInput label="Good ≥" value={config.cutoffs.good} onChange={(v) => setCutoff('good', v)} tone="amber" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
            <button
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
            >
              <RotateCcw size={12} /> Reset to defaults
            </button>
            <div className="flex items-center gap-2">
              {deployError && <span className="text-xs text-red-400">{deployError}</span>}
              {isDirty && (
                <button
                  onClick={onDiscard}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                  Discard
                </button>
              )}
              {isOfficer && (
                <button
                  onClick={onDeploy}
                  disabled={!isDirty || deploying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4318ff] text-white hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Rocket size={12} /> {deploying ? 'Deploying…' : 'Deploy to everyone'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── TierRow ─────────────────────────────────────────────────────────────

function TierRow({
  tier,
  onChange,
  onRemove,
  canRemove,
}: {
  tier: PowerTier;
  onChange: (patch: Partial<PowerTier>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <tr className="border-b border-[var(--border)]/50 last:border-b-0">
      <td className="py-1.5 pr-2">
        <input
          value={tier.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-20 px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
        />
      </td>
      <td className="py-1.5 px-2">
        <MillionInput value={tier.minPower} onChange={(v) => onChange({ minPower: v })} />
      </td>
      <td className="py-1.5 px-2">
        <MillionInput value={tier.targetDkp} onChange={(v) => onChange({ targetDkp: v })} />
      </td>
      <td className="py-1.5 px-2">
        <MillionInput value={tier.targetDeaths} onChange={(v) => onChange({ targetDeaths: v })} />
      </td>
      <td className="py-1.5">
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Remove tier"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

// ─── Numeric inputs ──────────────────────────────────────────────────────

function CoeffInput({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  tone: 'death' | 'kill';
}) {
  const toneClass = tone === 'death' ? 'border-emerald-500/30' : 'border-cyan-500/30';
  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step="0.1"
        className={`w-full px-2 py-1.5 rounded-md bg-[var(--background-secondary)] border ${toneClass} text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/50`}
      />
    </div>
  );
}

function CutoffInput({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  tone: 'emerald' | 'cyan' | 'amber';
}) {
  const toneClass =
    tone === 'emerald' ? 'border-emerald-500/30' : tone === 'cyan' ? 'border-cyan-500/30' : 'border-amber-500/30';
  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={Math.round(value * 100)}
          onChange={(e) => onChange((parseFloat(e.target.value) || 0) / 100)}
          step="1"
          className={`w-full px-2 py-1.5 rounded-md bg-[var(--background-secondary)] border ${toneClass} text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/50`}
        />
        <span className="text-xs text-[var(--text-muted)]">%</span>
      </div>
    </div>
  );
}

/** Input that stores its value in raw units but accepts/displays "M" (millions). */
function MillionInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState((value / 1_000_000).toString());
  useEffect(() => {
    setDraft((value / 1_000_000).toString());
  }, [value]);
  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="number"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n * 1_000_000);
        }}
        step="0.5"
        className="w-24 px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30"
      />
      <span className="text-xs text-[var(--text-muted)]">M</span>
    </div>
  );
}

// ─── PlayersTable ────────────────────────────────────────────────────────

interface PlayersTableProps {
  rows: SimpleScoredPlayer[];
  rankById: Map<number, number>;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  cutoffs: SimpleConfig['cutoffs'];
  showGovId: boolean;
}

function PlayersTable({ rows, rankById, sortKey, sortDir, onSort, cutoffs, showGovId }: PlayersTableProps) {
  return (
    <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-muted)] bg-[var(--background-secondary)]/40">
              <Th k="rank" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">#</Th>
              <Th k="username" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-left">Name</Th>
              <Th k="power" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">Power</Th>
              <Th k="tier" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-center">Tier</Th>
              <Th k="t4Deaths" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">T4d</Th>
              <Th k="t5Deaths" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">T5d</Th>
              <Th k="t4Kills" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">T4k</Th>
              <Th k="t5Kills" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">T5k</Th>
              <Th k="totalKP" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">KP</Th>
              <Th k="dkp" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">DKP</Th>
              <Th k="dkpRatio" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">DKP %</Th>
              <Th k="totalDeaths" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">Deaths</Th>
              <Th k="deathsRatio" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">Deaths %</Th>
              <Th k="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No players to show
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.characterId} className="border-t border-[var(--border)]/50 hover:bg-[var(--background-hover)]/30 transition-colors">
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                  {rankById.get(p.characterId) ?? ''}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[var(--foreground)] font-medium">{p.username}</span>
                  {showGovId && (
                    <span className="ml-2 text-xs text-[var(--text-muted)] font-mono">#{p.characterId}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtM(p.power)}</td>
                <td className="px-3 py-2 text-center">
                  {p.tier ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)]">
                      {p.tier.label}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t4Deaths)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t5Deaths)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t4Kills)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t5Kills)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmt(p.totalKP)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--foreground)] font-medium">{fmt(p.dkp)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${p.tier ? ratioColor(p.dkpRatio, cutoffs) : 'text-[var(--text-muted)]'}`}>
                  {p.tier ? fmtPct(p.dkpRatio) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.totalDeaths)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${p.tier ? ratioColor(p.deathsRatio, cutoffs) : 'text-[var(--text-muted)]'}`}>
                  {p.tier ? fmtPct(p.deathsRatio) : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[p.status]}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  k,
  sortKey,
  sortDir,
  onSort,
  align,
  children,
}: {
  k: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align: 'text-left' | 'text-right' | 'text-center';
  children: React.ReactNode;
}) {
  const active = sortKey === k;
  return (
    <th className={`px-3 py-2 font-normal ${align}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors ${active ? 'text-[var(--foreground)]' : ''}`}
      >
        {children}
        {active ? (
          <ArrowUpDown size={10} className={sortDir === 'asc' ? 'rotate-180' : ''} />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </button>
    </th>
  );
}
