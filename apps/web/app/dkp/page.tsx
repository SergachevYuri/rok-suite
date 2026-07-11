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
  Flag,
  HelpCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthRole, meetsRole } from '@/lib/auth-role';
import { SignInButton } from '@/components/SignInButton';
import { OUR_SEED_KDS } from '@/lib/kingdom/our-seed';
import {
  type DkpDataset,
  type KvK,
  parseStatsFile,
  parseRosterFile,
  pushRosterToKingdomStats,
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
  loadLatestDatasetPerKingdom,
  simpleConfigIdForKvK,
  MIGRATION_ROW_ID,
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

function ratioColor(r: number, cutoffs: { excellent: number; approved: number; good: number }): string {
  if (r >= cutoffs.excellent) return 'text-emerald-400';
  if (r >= cutoffs.approved) return 'text-cyan-400';
  if (r >= cutoffs.good) return 'text-amber-400';
  return 'text-rose-400';
}

function ratioBgColor(r: number, cutoffs: { excellent: number; approved: number; good: number }): string {
  if (r >= cutoffs.excellent) return 'bg-emerald-500';
  if (r >= cutoffs.approved) return 'bg-cyan-500';
  if (r >= cutoffs.good) return 'bg-amber-500';
  return 'bg-rose-500';
}

/** Cell content: percentage label on top + a mini progress bar filled to
 *  min(ratio, 100%). Ratios above 100% are clipped visually (the label still
 *  shows the true value, e.g. "156%"). Color matches the status cutoffs. */
function RatioCell({
  ratio,
  cutoffs,
}: {
  ratio: number;
  cutoffs: { excellent: number; approved: number; good: number };
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const textCls = ratioColor(ratio, cutoffs);
  const barCls = ratioBgColor(ratio, cutoffs);
  return (
    <span className="flex flex-col items-end gap-0.5 min-w-[52px]">
      <span className={`text-xs font-medium tabular-nums ${textCls}`}>{fmtPct(ratio)}</span>
      <span className="block w-full h-1 bg-[var(--background-secondary)] rounded-full overflow-hidden">
        <span
          className={`block h-full ${barCls} transition-[width] duration-200`}
          style={{ width: `${clamped * 100}%` }}
        />
      </span>
    </span>
  );
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
  | 'kpRatio'
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
  const t = useTranslations('dkp');
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
  /** Raw text draft for the "min power (M)" input — parsed to a numeric floor
   *  in useMemo below. Empty means no floor. */
  const [minPowerMDraft, setMinPowerMDraft] = useState('');
  const [showGovId, setShowGovId] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');

  // ─── Migration flagging (shared via MIGRATION_ROW_ID config row) ────────
  const [flaggedForMigration, setFlaggedForMigration] = useState<Set<number>>(new Set());
  const flagDirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await loadConfigRow<number[]>(MIGRATION_ROW_ID);
      if (cancelled) return;
      if (Array.isArray(ids)) setFlaggedForMigration(new Set(ids));
    })();
    const unsub = subscribeToConfigRow<number[]>(MIGRATION_ROW_ID, (ids) => {
      if (!flagDirtyRef.current && Array.isArray(ids)) {
        setFlaggedForMigration(new Set(ids));
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const persistFlagged = async (next: Set<number>) => {
    flagDirtyRef.current = true;
    try {
      await saveConfigRow(MIGRATION_ROW_ID, [...next]);
    } catch (e) {
      console.error('Failed to persist migration flags', e);
    } finally {
      flagDirtyRef.current = false;
    }
  };

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

  /** Parsed minPower floor in raw power units. Empty/invalid input → 0 (no filter). */
  const minPowerFloor = useMemo(() => {
    const n = parseFloat(minPowerMDraft.trim());
    return Number.isFinite(n) && n > 0 ? n * 1_000_000 : 0;
  }, [minPowerMDraft]);

  const filtered = useMemo(() => {
    let list = ranked;
    if (statusFilter !== 'ALL') list = list.filter((p) => p.status === statusFilter);
    if (tierFilter !== 'ALL') list = list.filter((p) => p.tier?.id === tierFilter);
    if (minPowerFloor > 0) list = list.filter((p) => p.power >= minPowerFloor);
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
  }, [ranked, search, statusFilter, tierFilter, minPowerFloor]);

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

  const rejectedCount = summary.counts.REJECTED;
  const flaggedInThisDataset = useMemo(() => {
    let n = 0;
    for (const p of scored) if (flaggedForMigration.has(p.characterId)) n++;
    return n;
  }, [scored, flaggedForMigration]);

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
      setDeployError(e instanceof Error ? e.message : t('config.errDeploy'));
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
    if (!selectedKvkId) throw new Error(t('upload.errPickKvkFirst'));
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

  const handleToggleFlag = (characterId: number) => {
    setFlaggedForMigration((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      persistFlagged(next);
      return next;
    });
  };

  const handleFlagAllRejected = () => {
    setFlaggedForMigration((prev) => {
      const next = new Set(prev);
      for (const p of scored) {
        if (p.status === 'REJECTED') next.add(p.characterId);
      }
      persistFlagged(next);
      return next;
    });
  };

  const handleClearFlagsInView = () => {
    // Unflag only players currently visible in the selected KD's scored set.
    setFlaggedForMigration((prev) => {
      const next = new Set(prev);
      for (const p of scored) next.delete(p.characterId);
      persistFlagged(next);
      return next;
    });
  };

  /** Wipe the entire emigration list — nukes every flag, including players
   *  from other KDs or previous sessions. Used before starting a fresh sweep. */
  const handleClearAllFlags = () => {
    if (flaggedForMigration.size === 0) return;
    if (!confirm(`Clear all ${flaggedForMigration.size} players from the emigration list?\nThis affects every KD and cannot be undone.`)) return;
    setFlaggedForMigration(new Set());
    persistFlagged(new Set());
  };

  /** Convenience: wipe the current emigration list AND flag every REJECTED
   *  player in the current scored set as the new list. */
  const handleReplaceWithRejected = () => {
    const rejectedIds = scored.filter((p) => p.status === 'REJECTED').map((p) => p.characterId);
    if (rejectedIds.length === 0) {
      alert('No REJECTED players in the current view — nothing to send.');
      return;
    }
    if (!confirm(`Replace the emigration list with ${rejectedIds.length} REJECTED players from ${selectedKvk?.name ?? 'this KvK'} · KD ${selectedKingdomId}?\nThis wipes any previously-flagged players (including from other KDs).`)) return;
    const next = new Set(rejectedIds);
    setFlaggedForMigration(next);
    persistFlagged(next);
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
              {t('header.eyebrow')}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">
              {t('header.title')}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {selectedKvk
                ? `${selectedKvk.name}${selectedKvk.archivedAt ? t('archivedSuffix') : ''}`
                : t('header.pickKvk')}
              {hasKd ? t('header.kingdomSuffix', { id: selectedKingdomId! }) : ''}
              {dataset?.statsFileName ? ` · ${dataset.statsFileName}` : ''}
            </p>
          </div>
          <SignInButton />
        </header>

        {/* KvK + Kingdom selectors */}
        <section className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              {t('selectors.kvkLabel')}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedKvkId ?? ''}
                onChange={(e) => setSelectedKvkId(e.target.value || null)}
                disabled={loadingKvks || kvks.length === 0}
                className="min-w-[180px] px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-40"
              >
                {kvks.length === 0 && <option value="">{t('selectors.none')}</option>}
                {kvks.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                    {k.archivedAt ? t('archivedSuffix') : ''}
                  </option>
                ))}
              </select>
              {isOfficer && (
                <button
                  type="button"
                  onClick={() => setKvkManagerOpen(true)}
                  className="px-2.5 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                  title={t('kvk.manageTitle')}
                >
                  <Settings2 size={14} />
                </button>
              )}
            </div>
          </div>
          {viewMode === 'single' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                {t('selectors.kingdomLabel')}
              </label>
              <select
                value={selectedKingdomId ?? ''}
                onChange={(e) => setSelectedKingdomId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={!hasKvk}
                className="min-w-[140px] px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30 disabled:opacity-40"
              >
                <option value="">{t('selectors.pickOne')}</option>
                {allKds.map((kd) => (
                  <option key={kd} value={kd}>
                    {t('kd', { id: kd })}
                    {extraKds.includes(kd) ? t('selectors.hasData') : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto">
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              {t('selectors.viewLabel')}
            </label>
            <div className="inline-flex rounded-lg overflow-hidden border border-[var(--border)] text-xs">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                disabled={!hasKvk}
                className={`px-3 py-2 transition-colors ${
                  viewMode === 'single'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                } disabled:opacity-40`}
              >
                {t('selectors.single')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compare')}
                disabled={!hasKvk}
                className={`px-3 py-2 transition-colors ${
                  viewMode === 'compare'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                } disabled:opacity-40`}
              >
                {t('selectors.compare')}
              </button>
            </div>
          </div>
        </section>

        {/* No-KvK CTA */}
        {!loadingKvks && !hasKvk && (
          <section className="mb-6 p-8 rounded-xl bg-[var(--background-card)] border border-dashed border-[var(--border)] text-center">
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              {kvks.length === 0 ? t('noKvk.empty') : t('noKvk.pick')}
            </p>
            {isOfficer && kvks.length === 0 && (
              <button
                onClick={() => setKvkManagerOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] transition-colors"
              >
                <Plus size={14} /> {t('noKvk.createFirst')}
              </button>
            )}
          </section>
        )}

        {hasKvk && viewMode === 'compare' && (
          <ComparisonView kvkId={selectedKvkId!} config={config} />
        )}

        {hasKvk && viewMode === 'single' && hasKd && (
          <>
            {/* Officer-only upload panel */}
            {isOfficer && (
              <UploadPanel
                onUploaded={handleDatasetUploaded}
                onReset={handleResetDataset}
                currentDataset={dataset}
                defaultKingdomId={selectedKingdomId}
                allKds={allKds}
                kvkId={selectedKvkId}
              />
            )}

            {/* Active dataset card */}
            {dataset && (
              <section className="mb-6 p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-[var(--text-muted)]" />
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">{t('dataset.period')}</p>
                    {dateRange ? (
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {dateRange.start} → {dateRange.end}
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          ({t('days', { count: dateRange.days })})
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">{t('dataset.unknownPeriod')}</p>
                    )}
                  </div>
                </div>
                <div className="h-8 w-px bg-[var(--border)]" />
                <div>
                  <p className="text-xs text-[var(--text-muted)]">{t('dataset.playersLabel')}</p>
                  <p className="text-sm font-medium text-[var(--foreground)]">{fmt(players.length)}</p>
                </div>
                {dataset.uploadedAt && (
                  <>
                    <div className="h-8 w-px bg-[var(--border)]" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">{t('dataset.uploaded')}</p>
                      <p className="text-sm text-[var(--foreground)]">{new Date(dataset.uploadedAt).toLocaleString()}</p>
                    </div>
                  </>
                )}
                {dataset.honorFileName && (
                  <>
                    <div className="h-8 w-px bg-[var(--border)]" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">{t('dataset.rosterFilter')}</p>
                      <p className="text-xs font-mono text-amber-400 truncate max-w-[220px]" title={dataset.honorFileName}>
                        {dataset.honorFileName}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">{t('dataset.ch25Only')}</p>
                    </div>
                  </>
                )}
              </section>
            )}

            {!dataset && !loadingDataset && (
              <section className="mb-6 p-6 rounded-xl bg-[var(--background-card)] border border-dashed border-[var(--border)] text-center">
                <p className="text-sm text-[var(--text-secondary)]">
                  {t('noScan', { kvk: selectedKvk?.name ?? '', kd: selectedKingdomId ?? '' })}
                </p>
              </section>
            )}

            {/* Summary cards */}
            <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-6">
              <SummaryCard label={t('summary.players')} value={fmt(summary.total)} />
              <SummaryCard label={t('summary.totalDkp')} value={fmt(summary.totalDkp)} />
              <SummaryCard label={t('summary.excellent')} value={fmt(summary.counts.EXCELLENT)} tone="excellent" />
              <SummaryCard label={t('summary.approved')} value={fmt(summary.counts.APPROVED)} tone="approved" />
              <SummaryCard label={t('summary.good')} value={fmt(summary.counts.GOOD)} tone="good" />
              <SummaryCard label={t('summary.rejected')} value={fmt(summary.counts.REJECTED)} tone="review" />
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
                  placeholder={t('filters.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SimpleStatus | 'ALL')}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              >
                <option value="ALL">{t('filters.allStatuses')}</option>
                <option value="EXCELLENT">{t('filters.excellent')}</option>
                <option value="APPROVED">{t('filters.approved')}</option>
                <option value="GOOD">{t('filters.good')}</option>
                <option value="REJECTED">{t('filters.rejected')}</option>
                <option value="UNRANKED">{t('filters.unranked')}</option>
              </select>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              >
                <option value="ALL">{t('filters.allTiers')}</option>
                {sortTiersAsc(config.tiers).map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label} · ≥{fmtM(tier.minPower)}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={minPowerMDraft}
                  onChange={(e) => setMinPowerMDraft(e.target.value)}
                  placeholder={t('filters.minPowerPlaceholder')}
                  step="1"
                  min="0"
                  className="w-32 px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
                <span className="text-xs text-[var(--text-muted)]">M</span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showGovId}
                  onChange={(e) => setShowGovId(e.target.checked)}
                  className="accent-[#4318ff]"
                />
                {t('filters.showIds')}
              </label>
            </section>

            {/* Migration flagging bar */}
            {isOfficer && (
              <section className="mb-3 flex flex-wrap items-center gap-3 p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
                <span className="inline-flex items-center gap-1.5 text-xs text-rose-300">
                  <Flag size={12} />
                  <span className="font-medium">{t('migration.flagged', { count: flaggedInThisDataset })}</span>
                  <span className="text-rose-300/60">{t('migration.inThisKd', { total: flaggedForMigration.size })}</span>
                </span>
                <button
                  type="button"
                  onClick={handleFlagAllRejected}
                  disabled={rejectedCount === 0}
                  className="px-3 py-1.5 rounded-md text-xs bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('migration.flagAllRejected', { count: rejectedCount })}
                </button>
                <button
                  type="button"
                  onClick={handleReplaceWithRejected}
                  disabled={rejectedCount === 0}
                  className="px-3 py-1.5 rounded-md text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Wipe the whole emigration list, then flag every REJECTED player from this view."
                >
                  {t('migration.replaceWithRejected', { count: rejectedCount })}
                </button>
                <button
                  type="button"
                  onClick={handleClearFlagsInView}
                  disabled={flaggedInThisDataset === 0}
                  className="px-3 py-1.5 rounded-md text-xs bg-[var(--background-secondary)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('migration.unflagAll')}
                </button>
                <button
                  type="button"
                  onClick={handleClearAllFlags}
                  disabled={flaggedForMigration.size === 0}
                  className="px-3 py-1.5 rounded-md text-xs bg-rose-500/10 text-rose-400 border border-rose-500/40 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Nuke every flag across every KD. Use before starting a fresh emigration sweep."
                >
                  {t('migration.clearAllFlags')}
                </button>
                <a
                  href="/migration"
                  className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] underline decoration-dotted underline-offset-2"
                >
                  {t('migration.openPage')}
                </a>
              </section>
            )}

            {/* Players table */}
            <PlayersTable
              rows={filtered}
              rankById={rankById}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              cutoffs={config.cutoffs}
              formula={config.formula}
              scoringRule={config.scoringRule}
              showGovId={showGovId}
              flagged={flaggedForMigration}
              onToggleFlag={isOfficer ? handleToggleFlag : null}
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
      return a.effectiveKp - b.effectiveKp;
    case 'dkp':
      return a.dkp - b.dkp;
    case 'kpRatio':
      return a.kpRatio - b.kpRatio;
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
  kvkId,
}: {
  onUploaded: (d: DkpDataset, kingdomId: number) => Promise<void>;
  onReset: () => void | Promise<void>;
  currentDataset: DkpDataset | null;
  defaultKingdomId: number;
  allKds: number[];
  /** Currently-selected KvK on the DKP page. Used to also mirror the roster
   *  into Kingdom Stats scan tables scoped to the same KvK. Skipped when null. */
  kvkId: string | null;
}) {
  const t = useTranslations('dkp');
  const fileRef = useRef<HTMLInputElement>(null);
  const rosterRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rosterFile, setRosterFile] = useState<File | null>(null);
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
      setError(t('upload.errPickStats'));
      return;
    }
    if (!effectiveKd) {
      setError(t('upload.errPickKingdom'));
      return;
    }
    setBusy(true);
    try {
      const stats = await parseStatsFile(file);
      let players = mergeIntoPlayers(stats, []);
      const beforeFilter = players.length;
      let rosterMatched = 0;
      let rosterFilename: string | null = null;

      let rosterFull: import('./data').RosterRow[] | null = null;
      if (rosterFile) {
        rosterFull = await parseRosterFile(rosterFile);
        // Build whitelist: player_id where KD == target AND cityhall == 25.
        const allowed = new Set<number>();
        for (const r of rosterFull) {
          if (r.kd === effectiveKd && r.cityhall === 25) allowed.add(r.playerId);
        }
        rosterMatched = allowed.size;
        if (allowed.size === 0) {
          throw new Error(t('upload.errRosterNoMatch', { kd: effectiveKd }));
        }
        players = players.filter((p) => allowed.has(p.characterId));
        rosterFilename = rosterFile.name;
        if (players.length === 0) {
          throw new Error(t('upload.errRosterZeroRows', { count: allowed.size }));
        }
      }

      await onUploaded(
        {
          uploadedAt: new Date().toISOString(),
          uploadedBy: null,
          statsFileName: file.name,
          // Repurpose honorFileName to keep the roster filename in db without a migration.
          honorFileName: rosterFilename,
          players,
        },
        effectiveKd,
      );

      // If we have a roster with the full player detail AND a KvK selected,
      // also push the roster into the Kingdom Stats scan tables so a single
      // upload double-duties. Scan date comes from the stats filename's end
      // date, falling back to today when the filename isn't the standard
      // YYYYMMDD_YYYYMMDD shape.
      let kingdomStatsPushed: { kingdoms: number; players: number } | null = null;
      let kingdomStatsError: string | null = null;
      const rosterHasDetail = !!rosterFull && rosterFull.some((r) => r.power != null || r.kp != null);
      if (rosterFull && rosterHasDetail && kvkId && kvkId !== 'legacy') {
        const scanDate = filenameMeta?.end ?? new Date().toISOString().slice(0, 10);
        try {
          kingdomStatsPushed = await pushRosterToKingdomStats(rosterFull, kvkId, scanDate);
        } catch (e) {
          console.error('Kingdom Stats mirror failed', e);
          kingdomStatsError = e instanceof Error ? e.message : String(e);
        }
      }

      const baseMsg = rosterFile
        ? t('upload.savedWithRoster', {
            saved: players.length,
            matched: rosterMatched,
            kd: effectiveKd,
            before: beforeFilter,
            filtered: beforeFilter - players.length,
          })
        : t('upload.saved', { saved: players.length, kd: effectiveKd });
      const suffix = kingdomStatsPushed
        ? ` · Kingdom Stats: ${kingdomStatsPushed.kingdoms} KDs / ${kingdomStatsPushed.players} players`
        : kingdomStatsError
          ? ` · Kingdom Stats push failed: ${kingdomStatsError}`
          : '';
      setInfo(baseMsg + suffix);
      setFile(null);
      setRosterFile(null);
      setKdOverride(null);
      if (fileRef.current) fileRef.current.value = '';
      if (rosterRef.current) rosterRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : t('upload.errParse'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Upload size={14} /> {t('upload.heading')}
        </h2>
        {currentDataset?.uploadedAt && (
          <button
            onClick={onReset}
            className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors inline-flex items-center gap-1"
          >
            <Trash2 size={12} /> {t('upload.deleteCurrent')}
          </button>
        )}
      </div>
      <div className="mb-4 space-y-1 text-xs text-[var(--text-muted)]">
        <p>
          <span className="font-medium text-[var(--text-secondary)]">{t('upload.statsFileLabel')}</span>
          {t('upload.statsFileReq')}
          <span className="font-mono text-[var(--text-secondary)]">KDID_YYYYMMDD_YYYYMMDD.xlsx</span>
          {t('upload.statsFileColumns')}
        </p>
        <p>
          <span className="font-medium text-[var(--text-secondary)]">{t('upload.rosterFileLabel')}</span>
          {t('upload.rosterFileOpt')}
          <span className="text-amber-400 font-medium">cityhall = 25</span>
          {t('upload.rosterColumns')}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t('upload.statsFileLabel')}</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
            >
              {t('upload.chooseFile')}
            </button>
            <span className="text-xs text-[var(--text-muted)] truncate">
              {file ? file.name : t('upload.noFile')}
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
              {t('upload.detectedPrefix')}
              {filenameMeta.kingdomId ? t('upload.detectedKd', { kd: filenameMeta.kingdomId }) : t('upload.detectedNoKd')}
              {filenameMeta.start} → {filenameMeta.end} ({t('days', { count: filenameMeta.days })})
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t('upload.rosterFieldLabel')}</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => rosterRef.current?.click()}
              className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
            >
              {t('upload.chooseRoster')}
            </button>
            <span className="text-xs text-[var(--text-muted)] truncate">
              {rosterFile ? rosterFile.name : t('upload.noFile')}
            </span>
            {rosterFile && (
              <button
                type="button"
                onClick={() => {
                  setRosterFile(null);
                  if (rosterRef.current) rosterRef.current.value = '';
                }}
                className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 transition-colors"
                title={t('upload.removeRoster')}
              >
                <X size={12} />
              </button>
            )}
            <input
              ref={rosterRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => setRosterFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t('upload.targetKingdom')}</label>
          <select
            value={effectiveKd ?? ''}
            onChange={(e) => setKdOverride(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
          >
            {kdOptions.map((kd) => (
              <option key={kd} value={kd}>
                {t('kd', { id: kd })}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleProcess}
          disabled={!file || busy}
          className="px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? t('upload.processing') : t('upload.process')}
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
  const t = useTranslations('dkp');
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
      setError(e instanceof Error ? e.message : t('kvk.errOp'));
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
    if (!confirm(t('kvk.confirmDelete', { name: k.name }))) return;
    await runOp(async () => {
      await deleteKvK(k.id);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('kvk.manageTitle')}</h3>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] block mb-1">{t('kvk.newName')}</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('kvk.newNamePlaceholder')}
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
            <Plus size={14} className="inline" /> {t('kvk.create')}
          </button>
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="space-y-1">
          {kvks.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">{t('kvk.empty')}</p>
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
                  title={t('kvk.clickToRename')}
                >
                  {k.name}
                  {k.archivedAt && <span className="ml-2 text-xs text-[var(--text-muted)]">{t('archivedSuffix')}</span>}
                </button>
              )}
              {editingId === k.id ? (
                <button
                  onClick={() => handleRename(k.id)}
                  disabled={busy}
                  className="px-2 py-1 rounded text-xs bg-[#4318ff] text-white hover:bg-[#3a14e0] disabled:opacity-40"
                >
                  {t('kvk.save')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleArchive(k)}
                    disabled={busy}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] px-2 py-1 transition-colors"
                  >
                    {k.archivedAt ? t('kvk.unarchive') : t('kvk.archive')}
                  </button>
                  <button
                    onClick={() => handleDelete(k)}
                    disabled={busy}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 transition-colors"
                    title={t('kvk.delete')}
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

// ─── ComparisonView ──────────────────────────────────────────────────────

interface KdSummary {
  kingdomId: number;
  filename: string | null;
  uploadedAt: string;
  players: number;
  totalDkp: number;
  avgPower: number;
  medianRatio: number;
  counts: Record<SimpleStatus, number>;
}

type ComparisonSortKey = 'kingdomId' | 'players' | 'avgPower' | 'totalDkp' | 'medianRatio' | 'excellent' | 'approved' | 'good' | 'rejected';

function ComparisonView({ kvkId, config }: { kvkId: string; config: SimpleConfig }) {
  const t = useTranslations('dkp');
  const [summaries, setSummaries] = useState<KdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<ComparisonSortKey>('kingdomId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const datasets = await loadLatestDatasetPerKingdom(kvkId);
      if (cancelled) return;
      const result: KdSummary[] = datasets.map((ds) => {
        const scored = computeSimpleScores(ds.players, config);
        const counts: Record<SimpleStatus, number> = {
          EXCELLENT: 0,
          APPROVED: 0,
          GOOD: 0,
          REJECTED: 0,
          UNRANKED: 0,
        };
        let totalDkp = 0;
        let totalPower = 0;
        const ratios: number[] = [];
        for (const p of scored) {
          counts[p.status]++;
          totalDkp += p.dkp;
          totalPower += p.power;
          if (p.tier) ratios.push(p.ratio);
        }
        ratios.sort((a, b) => a - b);
        const medianRatio = ratios.length === 0 ? 0 : ratios[Math.floor(ratios.length / 2)];
        return {
          kingdomId: ds.kingdomId ?? 0,
          filename: ds.statsFileName,
          uploadedAt: ds.uploadedAt,
          players: scored.length,
          totalDkp,
          avgPower: scored.length > 0 ? totalPower / scored.length : 0,
          medianRatio,
          counts,
        };
      });
      setSummaries(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kvkId, config]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = [...summaries];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'kingdomId':
          return (a.kingdomId - b.kingdomId) * dir;
        case 'players':
          return (a.players - b.players) * dir;
        case 'avgPower':
          return (a.avgPower - b.avgPower) * dir;
        case 'totalDkp':
          return (a.totalDkp - b.totalDkp) * dir;
        case 'medianRatio':
          return (a.medianRatio - b.medianRatio) * dir;
        case 'excellent':
          return (a.counts.EXCELLENT - b.counts.EXCELLENT) * dir;
        case 'approved':
          return (a.counts.APPROVED - b.counts.APPROVED) * dir;
        case 'good':
          return (a.counts.GOOD - b.counts.GOOD) * dir;
        case 'rejected':
          return (a.counts.REJECTED - b.counts.REJECTED) * dir;
      }
    });
    return arr;
  }, [summaries, sortKey, sortDir]);

  const handleSort = (k: ComparisonSortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(k);
      setSortDir(k === 'kingdomId' ? 'asc' : 'desc');
    }
  };

  // Aggregate totals
  const totals = useMemo(() => {
    let players = 0;
    let totalDkp = 0;
    const counts: Record<SimpleStatus, number> = {
      EXCELLENT: 0,
      APPROVED: 0,
      GOOD: 0,
      REJECTED: 0,
      UNRANKED: 0,
    };
    for (const s of summaries) {
      players += s.players;
      totalDkp += s.totalDkp;
      counts.EXCELLENT += s.counts.EXCELLENT;
      counts.APPROVED += s.counts.APPROVED;
      counts.GOOD += s.counts.GOOD;
      counts.REJECTED += s.counts.REJECTED;
      counts.UNRANKED += s.counts.UNRANKED;
    }
    return { players, totalDkp, counts };
  }, [summaries]);

  if (loading) {
    return (
      <section className="mb-6 p-8 rounded-xl bg-[var(--background-card)] border border-[var(--border)] text-center">
        <p className="text-sm text-[var(--text-muted)]">{t('compare.loading')}</p>
      </section>
    );
  }

  if (summaries.length === 0) {
    return (
      <section className="mb-6 p-8 rounded-xl bg-[var(--background-card)] border border-dashed border-[var(--border)] text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {t('compare.empty')}
        </p>
      </section>
    );
  }

  return (
    <>
      {/* Aggregate cards across all KDs */}
      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <SummaryCard label={t('compare.kingdoms')} value={fmt(summaries.length)} />
        <SummaryCard label={t('summary.players')} value={fmt(totals.players)} />
        <SummaryCard label={t('summary.totalDkp')} value={fmt(totals.totalDkp)} />
        <SummaryCard label={t('summary.excellent')} value={fmt(totals.counts.EXCELLENT)} tone="excellent" />
        <SummaryCard label={t('summary.approved')} value={fmt(totals.counts.APPROVED)} tone="approved" />
        <SummaryCard label={t('summary.rejected')} value={fmt(totals.counts.REJECTED)} tone="review" />
      </section>

      <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-muted)] bg-[var(--background-secondary)]/40">
                <CompareTh k="kingdomId" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-left">{t('compare.colKingdom')}</CompareTh>
                <CompareTh k="players" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colPlayers')}</CompareTh>
                <CompareTh k="avgPower" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colAvgPower')}</CompareTh>
                <CompareTh k="totalDkp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colTotalDkp')}</CompareTh>
                <CompareTh k="medianRatio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colMedianRatio')}</CompareTh>
                <CompareTh k="excellent" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colExc')}</CompareTh>
                <CompareTh k="approved" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colApp')}</CompareTh>
                <CompareTh k="good" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colGood')}</CompareTh>
                <CompareTh k="rejected" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="text-right">{t('compare.colRej')}</CompareTh>
                <th className="px-3 py-2 font-normal text-left">{t('compare.colSource')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.kingdomId} className="border-t border-[var(--border)]/50 hover:bg-[var(--background-hover)]/30 transition-colors">
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{t('kd', { id: s.kingdomId })}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(s.players)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtM(s.avgPower)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--foreground)]">{fmt(s.totalDkp)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${ratioColor(s.medianRatio, config.cutoffs)}`}>
                    {fmtPct(s.medianRatio)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmt(s.counts.EXCELLENT)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-cyan-400">{fmt(s.counts.APPROVED)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-400">{fmt(s.counts.GOOD)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-400">{fmt(s.counts.REJECTED)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)] font-mono truncate max-w-[180px]" title={s.filename ?? ''}>
                    {s.filename ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CompareTh({
  k,
  sortKey,
  sortDir,
  onSort,
  align,
  children,
}: {
  k: ComparisonSortKey;
  sortKey: ComparisonSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: ComparisonSortKey) => void;
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
  const t = useTranslations('dkp');
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
          minPower: lastMin + 20_000_000,
          kpMultiplier: 1,
          deathsPct: 1,
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
          <Settings2 size={14} /> {t('config.title')}
          {isDirty && isOfficer && (
            <span className="text-xs font-normal text-amber-400">{t('config.unsaved')}</span>
          )}
          {isDirty && !isOfficer && (
            <span className="text-xs font-normal text-[var(--text-muted)]">{t('config.localPreview')}</span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[var(--border)] space-y-6">
          {!isOfficer && (
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              {t('config.readOnlyNote')}
            </p>
          )}

          {/* Formula */}
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              {t('config.formulaTitle')}
            </h3>
            <div className="mb-3 p-3 rounded-lg bg-[var(--background-secondary)]/50 border border-[var(--border)] font-mono text-xs leading-relaxed">
              <span className="text-[var(--text-muted)]">{t('config.formulaPrefix')}</span>
              <span className="text-emerald-400">{t('config.formulaT5Deaths', { n: config.formula.t5Death })}</span>
              <span className="text-[var(--text-muted)]"> + </span>
              <span className="text-emerald-400">{t('config.formulaT4Deaths', { n: config.formula.t4Death })}</span>
              <span className="text-[var(--text-muted)]"> + </span>
              <span className="text-cyan-400">{t('config.formulaT5Kills', { n: config.formula.t5Kill })}</span>
              <span className="text-[var(--text-muted)]"> + </span>
              <span className="text-cyan-400">{t('config.formulaT4Kills', { n: config.formula.t4Kill })}</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-3 italic">
              {t('config.formulaNote')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CoeffInput label={t('config.coeffT5Death')} value={config.formula.t5Death} onChange={(v) => setFormula('t5Death', v)} tone="death" />
              <CoeffInput label={t('config.coeffT4Death')} value={config.formula.t4Death} onChange={(v) => setFormula('t4Death', v)} tone="death" />
              <CoeffInput label={t('config.coeffT5Kill')} value={config.formula.t5Kill} onChange={(v) => setFormula('t5Kill', v)} tone="kill" />
              <CoeffInput label={t('config.coeffT4Kill')} value={config.formula.t4Kill} onChange={(v) => setFormula('t4Kill', v)} tone="kill" />
            </div>
          </div>

          {/* Tier mode */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {t('config.targetsTitle')}
              </h3>
              <div className="inline-flex rounded-lg overflow-hidden border border-[var(--border)] text-xs">
                <button
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, tierMode: 'flat' }))}
                  className={`px-3 py-1 transition-colors ${
                    config.tierMode === 'flat'
                      ? 'bg-[#4318ff] text-white'
                      : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t('config.flatMode')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, tierMode: 'tiered' }))}
                  className={`px-3 py-1 transition-colors ${
                    config.tierMode === 'tiered'
                      ? 'bg-[#4318ff] text-white'
                      : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t('config.tieredMode')}
                </button>
              </div>
            </div>

            {config.tierMode === 'flat' ? (
              <>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  {t('config.flatDesc')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1" title={t('config.reqKpTitle')}>
                      {t('config.reqKpLabel')}
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={config.flatTarget.kpMultiplier}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          setConfig((c) => ({
                            ...c,
                            flatTarget: { ...c.flatTarget, kpMultiplier: Number.isFinite(n) && n >= 0 ? n : 0 },
                          }));
                        }}
                        step="0.25"
                        min="0"
                        className="w-full px-2 py-1.5 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                      />
                      <span className="text-xs text-[var(--text-muted)]">{t('config.perPower')}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1" title={t('config.reqDeadTitle')}>
                      {t('config.reqDeadLabel')}
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={config.flatTarget.deathsPct}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
                          setConfig((c) => ({
                            ...c,
                            flatTarget: { ...c.flatTarget, deathsPct: clamped },
                          }));
                        }}
                        step="0.25"
                        min="0"
                        max="100"
                        className="w-full px-2 py-1.5 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                      />
                      <span className="text-xs text-[var(--text-muted)]">%</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('config.tieredDescA')}<em>{t('config.tieredDescEm')}</em>{t('config.tieredDescB')}
                  </p>
                  <button
                    onClick={addTier}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <Plus size={12} /> {t('config.addTier')}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                        <th className="text-left py-2 pr-2 font-normal">{t('config.tierColLabel')}</th>
                        <th className="text-right py-2 px-2 font-normal">{t('config.tierColMinPower')}</th>
                        <th className="text-right py-2 px-2 font-normal" title={t('config.reqKpTitle')}>
                          {t('config.reqKpLabel')}
                        </th>
                        <th className="text-right py-2 px-2 font-normal" title={t('config.reqDeadTitle')}>
                          {t('config.reqDeadLabel')}
                        </th>
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
              </>
            )}
          </div>

          {/* Scoring scope */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              {t('config.scopeTitle')}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t('config.scopeDesc')}<span className="text-[var(--text-secondary)]">{t('config.scopeDescBold')}</span>
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <label className="text-xs text-[var(--text-muted)] whitespace-nowrap">{t('config.topNLabel')}</label>
              <input
                type="number"
                min="0"
                value={config.topN}
                onChange={(e) => setConfig((c) => ({ ...c, topN: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                className="w-24 px-2 py-1.5 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              />
              <span className="text-xs text-[var(--text-muted)]">{config.topN === 0 ? t('config.allPlayers') : t('config.nPlayers', { n: config.topN })}</span>
            </div>
          </div>

          {/* Scoring rule */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              {t('config.ruleTitle')}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t('config.ruleDesc')}
            </p>
            <div className="inline-flex rounded-lg overflow-hidden border border-[var(--border)] text-xs">
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, scoringRule: 'both' }))}
                className={`px-3 py-1.5 transition-colors ${
                  config.scoringRule === 'both'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
                title={t('config.ruleBothTitle')}
              >
                {t('config.ruleBoth')}
              </button>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, scoringRule: 'kp' }))}
                className={`px-3 py-1.5 transition-colors ${
                  config.scoringRule === 'kp'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
                title={t('config.ruleKpTitle')}
              >
                {t('config.ruleKp')}
              </button>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, scoringRule: 'deaths' }))}
                className={`px-3 py-1.5 transition-colors ${
                  config.scoringRule === 'deaths'
                    ? 'bg-[#4318ff] text-white'
                    : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
                title={t('config.ruleDeathsTitle')}
              >
                {t('config.ruleDeaths')}
              </button>
            </div>
          </div>

          {/* Cutoffs */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              {t('config.cutoffsTitle')}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {config.scoringRule === 'both' && (
                <>{t('config.cutoffUses')}<span className="font-mono">min(KP%, Deaths%)</span>{t('config.cutoffBothSuffix')}</>
              )}
              {config.scoringRule === 'kp' && (
                <>{t('config.cutoffUses')}<span className="font-mono">KP%</span>{t('config.cutoffKpSuffix')}</>
              )}
              {config.scoringRule === 'deaths' && (
                <>{t('config.cutoffUses')}<span className="font-mono">Deaths%</span>{t('config.cutoffDeathsSuffix')}</>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CutoffInput label={t('config.cutoffExcellent')} value={config.cutoffs.excellent} onChange={(v) => setCutoff('excellent', v)} tone="emerald" />
              <CutoffInput label={t('config.cutoffApproved')} value={config.cutoffs.approved} onChange={(v) => setCutoff('approved', v)} tone="cyan" />
              <CutoffInput label={t('config.cutoffGood')} value={config.cutoffs.good} onChange={(v) => setCutoff('good', v)} tone="amber" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
            <button
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
            >
              <RotateCcw size={12} /> {t('config.resetDefaults')}
            </button>
            <div className="flex items-center gap-2">
              {deployError && <span className="text-xs text-red-400">{deployError}</span>}
              {isDirty && (
                <button
                  onClick={onDiscard}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                  {t('config.discard')}
                </button>
              )}
              {isOfficer && (
                <button
                  onClick={onDeploy}
                  disabled={!isDirty || deploying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4318ff] text-white hover:bg-[#3a14e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Rocket size={12} /> {deploying ? t('config.deploying') : t('config.deploy')}
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
  const t = useTranslations('dkp');
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
        <MultiplierInput value={tier.kpMultiplier} onChange={(v) => onChange({ kpMultiplier: v })} />
      </td>
      <td className="py-1.5 px-2">
        <PercentInput value={tier.deathsPct} onChange={(v) => onChange({ deathsPct: v })} step={0.25} maxValue={100} />
      </td>
      <td className="py-1.5">
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t('config.removeTier')}
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

/** Percentage input. Displayed with a "%" suffix. */
function PercentInput({
  value,
  onChange,
  step = 1,
  maxValue = 100,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  maxValue?: number;
}) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(0, Math.min(maxValue, n)) : 0);
        }}
        step={step}
        min="0"
        max={maxValue}
        className="w-24 px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30"
      />
      <span className="text-xs text-[var(--text-muted)]">%</span>
    </div>
  );
}

/** Multiplier of power input (e.g. 1.75× Power). */
function MultiplierInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTranslations('dkp');
  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
        step="0.25"
        min="0"
        className="w-24 px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--foreground)]/30"
      />
      <span className="text-xs text-[var(--text-muted)]">{t('config.perPower')}</span>
    </div>
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
  formula: SimpleConfig['formula'];
  scoringRule: SimpleConfig['scoringRule'];
  showGovId: boolean;
  /** IDs of players flagged for migration (shared across the app). */
  flagged: Set<number>;
  /** When provided, the checkbox column is shown (officer-only). null = read-only. */
  onToggleFlag: ((characterId: number) => void) | null;
}

type TFn = ReturnType<typeof useTranslations>;

function dkpBreakdown(
  p: SimpleScoredPlayer,
  f: SimpleConfig['formula'],
  rule: SimpleConfig['scoringRule'],
  t: TFn,
): string {
  const deathLines =
    `  ${t('tips.t5Deaths')} ${fmt(p.t5Deaths)} × ${f.t5Death} = ${fmt(p.t5Deaths * f.t5Death)}\n` +
    `+ ${t('tips.t4Deaths')} ${fmt(p.t4Deaths)} × ${f.t4Death} = ${fmt(p.t4Deaths * f.t4Death)}`;
  const killLines =
    `+ ${t('tips.t5Kills')} ${fmt(p.t5Kills)} × ${f.t5Kill} = ${fmt(p.t5Kills * f.t5Kill)}\n` +
    `+ ${t('tips.t4Kills')} ${fmt(p.t4Kills)} × ${f.t4Kill} = ${fmt(p.t4Kills * f.t4Kill)}`;
  let body: string;
  switch (rule) {
    case 'kp':
      body = `${killLines}\n${t('tips.deathsExcluded')}`;
      break;
    case 'deaths':
      body = `${deathLines}\n${t('tips.killsExcluded')}`;
      break;
    case 'both':
    default:
      body = `${deathLines}\n${killLines}`;
  }
  return `${t('tips.breakdownTitle')}\n${body}\n= ${fmt(p.dkp)}`;
}

/** Shared footer line pointing officers at where the tier numbers are configured. */
function TipSource({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block border-t border-[var(--border)] pt-1.5 text-[10px] text-[var(--text-muted)]">{children}</span>;
}

/** Rich hover content for the KP % cell — names the tier, shows the math, cites the source. */
function kpTipContent(p: SimpleScoredPlayer, t: TFn): React.ReactNode {
  if (!p.tier) return null;
  return (
    <span className="block">
      <span className="block font-semibold text-[var(--foreground)]">{t('tips.kpTitle', { tier: p.tier.label })}</span>
      <span className="block">{t('tips.kpMath', { mult: p.tier.kpMultiplier, power: fmtM(p.power), target: fmt(p.kpTarget) })}</span>
      <span className="block">{t('tips.kpActualPrefix', { kp: fmt(p.effectiveKp) })}<span className="font-medium">{fmtPct(p.kpRatio)}</span>{t('tips.ofTarget')}</span>
      <span className="block text-[var(--text-muted)]">T4 {fmt(p.t4Kills)} × 10 + T5 {fmt(p.t5Kills)} × 20 = {fmt(p.effectiveKp)} · raw game KP {fmt(p.totalKP)}</span>
      <TipSource>{t('tips.kpSourceA', { tier: p.tier.label })}<span className="text-[var(--text-secondary)]">{t('tips.configPanel')}</span>{t('tips.sourcePanelSuffix')}</TipSource>
    </span>
  );
}

/** Rich hover content for the Deaths % cell. */
function deathsTipContent(p: SimpleScoredPlayer, t: TFn): React.ReactNode {
  if (!p.tier) return null;
  return (
    <span className="block">
      <span className="block font-semibold text-[var(--foreground)]">{t('tips.deathsTitle', { tier: p.tier.label })}</span>
      <span className="block">{t('tips.deathsMath', { pct: p.tier.deathsPct, power: fmtM(p.power), target: fmt(p.deathsTarget) })}</span>
      <span className="block">{t('tips.deathsActualPrefix', { deaths: fmt(p.totalDeaths) })}<span className="font-medium">{fmtPct(p.deathsRatio)}</span>{t('tips.ofTarget')}</span>
      <TipSource>{t('tips.deathsSourceA', { tier: p.tier.label })}<span className="text-[var(--text-secondary)]">{t('tips.configPanel')}</span>{t('tips.sourcePanelSuffix')}</TipSource>
    </span>
  );
}

/** Rich hover content for the Tier badge — the single place both targets are spelled out. */
function tierTipContent(p: SimpleScoredPlayer, t: TFn): React.ReactNode {
  if (!p.tier) {
    return (
      <span className="block">
        <span className="block font-semibold text-[var(--foreground)]">{t('tips.noTierTitle')}</span>
        <span className="block">{t('tips.noTierBody', { power: fmtM(p.power) })}</span>
        <TipSource>{t('tips.noTierSourceA')}<span className="text-[var(--text-secondary)]">{t('tips.configPanel')}</span>{t('tips.sourcePanelSuffix')}</TipSource>
      </span>
    );
  }
  return (
    <span className="block">
      <span className="block font-semibold text-[var(--foreground)]">{t('tips.tierTitle', { tier: p.tier.label, power: fmtM(p.tier.minPower) })}</span>
      <span className="block">{t('tips.tierKpTarget', { mult: p.tier.kpMultiplier, target: fmt(p.kpTarget) })}</span>
      <span className="block">{t('tips.tierDeathsTarget', { pct: p.tier.deathsPct, target: fmt(p.deathsTarget) })}</span>
      <TipSource>{t('tips.tierSourceA')}<span className="text-[var(--text-secondary)]">{t('tips.configPanel')}</span>{t('tips.sourcePanelSuffix')}</TipSource>
    </span>
  );
}

function PlayersTable({ rows, rankById, sortKey, sortDir, onSort, cutoffs, formula, scoringRule, showGovId, flagged, onToggleFlag }: PlayersTableProps) {
  const t = useTranslations('dkp');
  const showFlagCol = onToggleFlag !== null;
  // The scroll container has BOTH axis overflow set on the same element (`overflow-auto`)
  // and a max-height so it acts as the sticky ancestor. Without a bounded scroll
  // container, `sticky top-0` sticks to the top of the page — hidden as soon as
  // the section title scrolls off. Trade-off: the table scrolls internally.
  const thBg = 'bg-[var(--background-card)]';
  const thSticky = `sticky top-0 z-10 ${thBg} border-b border-[var(--border)]`;
  return (
    <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-10rem)]">
        <table className="w-full text-sm">
          <thead className={thBg}>
            <tr className="text-xs text-[var(--text-muted)]">
              {showFlagCol && (
                <th className={`${thSticky} px-2 py-2 w-8 text-center`} title={t('table.flagForMigration')}>
                  <Flag size={12} className="inline text-rose-400" />
                </th>
              )}
              <Th k="rank" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right">{t('columns.rank')}</Th>
              <Th k="username" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-left">{t('columns.name')}</Th>
              <Th k="power" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.power')}>{t('columns.power')}</Th>
              <Th k="tier" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-center" help={t('columnHelp.tier')}>{t('columns.tier')}</Th>
              <Th k="t4Deaths" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.t4Deaths')}>{t('columns.t4Deaths')}</Th>
              <Th k="t5Deaths" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.t5Deaths')}>{t('columns.t5Deaths')}</Th>
              <Th k="t4Kills" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.t4Kills')}>{t('columns.t4Kills')}</Th>
              <Th k="t5Kills" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.t5Kills')}>{t('columns.t5Kills')}</Th>
              <Th k="totalKP" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.kp')}>{t('columns.kp')}</Th>
              <Th k="dkp" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.dkp')}>{t('columns.dkp')}</Th>
              <Th k="kpRatio" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.kpPct')}>{t('columns.kpPct')}</Th>
              <Th k="totalDeaths" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.deaths')}>{t('columns.deaths')}</Th>
              <Th k="deathsRatio" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-right" help={t('columnHelp.deathsPct')}>{t('columns.deathsPct')}</Th>
              <Th k="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="text-center" help={t('columnHelp.status')}>{t('columns.status')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={showFlagCol ? 15 : 14} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  {t('table.empty')}
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const isFlagged = flagged.has(p.characterId);
              return (
              <tr
                key={p.characterId}
                className={`border-t border-[var(--border)]/50 hover:bg-[var(--background-hover)]/30 transition-colors ${
                  isFlagged ? 'bg-rose-500/5' : ''
                }`}
              >
                {showFlagCol && (
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isFlagged}
                      onChange={() => onToggleFlag?.(p.characterId)}
                      className="accent-rose-500 cursor-pointer"
                      title={isFlagged ? t('table.unflag') : t('table.flagForMigration')}
                    />
                  </td>
                )}
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
                  <Tip content={tierTipContent(p, t)} className="inline-flex justify-center">
                    {p.tier ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)]">
                        {p.tier.label}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </Tip>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t4Deaths)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t5Deaths)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t4Kills)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.t5Kills)}</td>
                <td
                  className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] cursor-help"
                  title={`Effective KP = T4 ${fmt(p.t4Kills)} × 10 + T5 ${fmt(p.t5Kills)} × 20 = ${fmt(p.effectiveKp)}\nRaw game KP (T1-T5 combined) = ${fmt(p.totalKP)}`}
                >
                  {fmt(p.effectiveKp)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--foreground)] font-medium">
                  <Tip
                    content={<span className="block whitespace-pre-line font-mono text-[11px]">{dkpBreakdown(p, formula, scoringRule, t)}</span>}
                    className="inline-flex justify-end"
                  >
                    {fmt(p.dkp)}
                  </Tip>
                </td>
                <td className="px-3 py-2 min-w-[80px]">
                  {p.tier ? (
                    <Tip content={kpTipContent(p, t)} className="flex w-full justify-end">
                      <RatioCell ratio={p.kpRatio} cutoffs={cutoffs} />
                    </Tip>
                  ) : (
                    <span className="text-right block text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{fmt(p.totalDeaths)}</td>
                <td className="px-3 py-2 min-w-[80px]">
                  {p.tier ? (
                    <Tip content={deathsTipContent(p, t)} className="flex w-full justify-end">
                      <RatioCell ratio={p.deathsRatio} cutoffs={cutoffs} />
                    </Tip>
                  ) : (
                    <span className="text-right block text-[var(--text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[p.status]}`}>
                    {t(`status.${p.status}`)}
                  </span>
                </td>
              </tr>
              );
            })}
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
  help,
  children,
}: {
  k: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align: 'text-left' | 'text-right' | 'text-center';
  /** Optional plain-text explanation shown on hover of a small "?" icon. */
  help?: string;
  children: React.ReactNode;
}) {
  const active = sortKey === k;
  const justify =
    align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start';
  return (
    <th className={`sticky top-0 z-10 bg-[var(--background-card)] border-b border-[var(--border)] px-3 py-2 font-normal ${align}`}>
      <span className={`inline-flex items-center gap-1 ${justify}`}>
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
        {help && <HeaderHelp text={help} />}
      </span>
    </th>
  );
}

/** Wraps any trigger and shows a styled popover on hover or click.
 *  Uses fixed positioning (computed from the trigger's rect) so the popover
 *  is not clipped by the table's overflow/scroll container. Not interactive
 *  (pointer-events-none) so moving onto it closes it, like a tooltip. */
function Tip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Clamp horizontally so edge columns don't overflow the viewport.
    const left = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
    setCoords({ top: r.bottom + 6, left });
    setOpen(true);
  };

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (open) setOpen(false);
        else show();
      }}
      className={`cursor-help ${className ?? ''}`}
    >
      {children}
      {open && coords && (
        <span
          role="tooltip"
          style={{ position: 'fixed', top: coords.top, left: coords.left, transform: 'translateX(-50%)', zIndex: 60 }}
          className="pointer-events-none block w-max max-w-[300px] rounded-lg border border-[var(--border)] bg-[var(--background-card)] px-3 py-2 text-left text-xs font-normal normal-case tracking-normal leading-snug text-[var(--text-secondary)] shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** A "?" icon that reveals a plain-text explanation on hover or click. */
function HeaderHelp({ text }: { text: string }) {
  return (
    <Tip content={text} className="inline-flex items-center text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors">
      <HelpCircle size={11} className="opacity-60" />
    </Tip>
  );
}
