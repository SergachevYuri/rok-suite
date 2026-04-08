'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { ArrowUpDown, Search, Upload, Lock, LogOut, X } from 'lucide-react';
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
} from './data';

interface Config {
  weights: { dkp: number; deaths: number; rss: number; helps: number; honor: number };
  meta: {
    dkpDivisor: number;
    deathMetaLow: number;
    deathMetaHigh: number;
    powerThreshold: number;
    rssMultiplier: number;
    helpsMultiplier: number;
    honorMultiplier: number;
  };
  statusThresholds: { excellent: number; approved: number; good: number };
}

const DEFAULT_CONFIG: Config = {
  weights: { dkp: 0.4, deaths: 0.3, rss: 0.15, helps: 0.15, honor: 0 },
  meta: {
    dkpDivisor: 4,
    deathMetaLow: 0.004,
    deathMetaHigh: 0.006,
    powerThreshold: 40_000_000,
    rssMultiplier: 3.0,
    helpsMultiplier: 0.0003,
    honorMultiplier: 0.001,
  },
  statusThresholds: { excellent: 1.5, approved: 1.0, good: 0.8 },
};

const WEIGHTS_KEY = 'dkp-weights-v1';

type Status = 'EXCELLENT' | 'APPROVED' | 'GOOD' | 'REJECTED';

interface ScoredPlayer extends Player {
  computedDkp: number;
  scoreDkp: number;
  scoreDeaths: number;
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
  const { weights, meta, statusThresholds } = config;
  return players.map((p) => {
    const computedDkp = p.t4Kills * 5 + p.t5Kills * 10 + p.t4Deaths * 8 + p.t5Deaths * 24;
    const deathMeta =
      p.highestPower < meta.powerThreshold ? meta.deathMetaLow : meta.deathMetaHigh;
    const metaDkp = p.highestPower / meta.dkpDivisor;
    const metaDeaths = p.highestPower * deathMeta;
    const metaRss = p.highestPower * meta.rssMultiplier;
    const metaHelps = p.highestPower * meta.helpsMultiplier;
    const metaHonor = p.highestPower * meta.honorMultiplier;

    const scoreDkp = safeDiv(p.dkp || computedDkp, metaDkp);
    const scoreDeaths = safeDiv(p.t5Deaths + p.t4Deaths, metaDeaths);
    const scoreRss = safeDiv(p.rssGathered, metaRss);
    const scoreHelps = safeDiv(p.allianceHelps, metaHelps);
    const scoreHonor = safeDiv(p.honorPoints, metaHonor);

    let num = 0;
    let den = 0;
    const components: [number, number][] = [
      [scoreDkp, weights.dkp],
      [scoreDeaths, weights.deaths],
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
      scoreDeaths,
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
  | 'dkp'
  | 'finalScore'
  | 'scoreDkp'
  | 'scoreDeaths'
  | 'scoreRss'
  | 'scoreHelps'
  | 'scoreHonor'
  | 'honorPoints';

interface ColumnDef {
  key: SortKey | 'status';
  label: string;
  numeric?: boolean;
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Player', defaultVisible: true },
  { key: 'power', label: 'Power', numeric: true, defaultVisible: true },
  { key: 'dkp', label: 'DKP', numeric: true, defaultVisible: true },
  { key: 'finalScore', label: 'Final', numeric: true, defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'scoreDkp', label: 'sDKP', numeric: true, defaultVisible: true },
  { key: 'scoreDeaths', label: 'sDeaths', numeric: true, defaultVisible: true },
  { key: 'scoreRss', label: 'sRSS', numeric: true, defaultVisible: true },
  { key: 'scoreHelps', label: 'sHelps', numeric: true, defaultVisible: true },
  { key: 'scoreHonor', label: 'sHonor', numeric: true, defaultVisible: false },
  { key: 'honorPoints', label: 'Honor', numeric: true, defaultVisible: false },
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
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('finalScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<Status | 'ALL'>('ALL');
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  );

  // Load weights from storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WEIGHTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setConfig((c) => ({ ...c, weights: { ...c.weights, ...parsed } }));
      }
    } catch {}
  }, []);

  // Persist weights
  useEffect(() => {
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(config.weights));
    } catch {}
  }, [config.weights]);

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

  const filtered = useMemo(() => {
    let list = scored;
    if (statusFilter !== 'ALL') list = list.filter((p) => p.status === statusFilter);
    if (search.trim()) list = list.filter((p) => looseMatch(p.username, search));
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

  const setWeight = (key: keyof Config['weights'], value: number) => {
    setConfig((c) => ({ ...c, weights: { ...c.weights, [key]: value } }));
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
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-4">
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
        <section className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <SummaryCard label="Players" value={fmt(summary.total)} />
          <SummaryCard label="Total DKP" value={fmt(summary.totalDkp)} />
          <SummaryCard label="Excellent" value={fmt(summary.counts.EXCELLENT)} tone="amber" />
          <SummaryCard label="Approved" value={fmt(summary.counts.APPROVED)} tone="emerald" />
          <SummaryCard label="Good" value={fmt(summary.counts.GOOD)} tone="sky" />
          <SummaryCard label="Rejected" value={fmt(summary.counts.REJECTED)} tone="red" />
        </section>

        {/* Weights */}
        <section className="mb-6 p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Score Weights</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Weighted average of sub-scores. Set to 0 to disable.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(['dkp', 'deaths', 'rss', 'helps', 'honor'] as const).map((k) => (
              <WeightSlider
                key={k}
                label={k.toUpperCase()}
                value={config.weights[k]}
                onChange={(v) => setWeight(k, v)}
              />
            ))}
          </div>
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
              placeholder="Search player… (loose, accent-insensitive)"
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
        <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 text-right w-12">#</th>
                  {COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-3 ${c.numeric ? 'text-right' : 'text-left'} ${
                        c.key !== 'status' ? 'cursor-pointer hover:text-[var(--foreground)]' : ''
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
                {filtered.map((p, i) => (
                  <tr
                    key={p.characterId}
                    className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors"
                  >
                    <td className="px-3 py-2 text-right text-[var(--text-muted)] tabular-nums">
                      {i + 1}
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
    case 'scoreDeaths':
      return fmt2(p.scoreDeaths);
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
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Stored locally in your browser. Stats file: kingdom XLSX export
        (e.g. <code>3923_20260313_20260323_statsExport.xlsx</code>). Honor file: optional
        rankings XLSX (e.g. <code>Honor_Rankings_KD3923_s11421.xlsx</code>), matched by name.
      </p>
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
    <div className="p-3 rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {label}
      </div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-[var(--text-secondary)]">{label}</label>
        <span className="text-xs tabular-nums text-[var(--foreground)]">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#4318ff]"
      />
    </div>
  );
}
