'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, ChevronUp, ChevronDown, BarChart3, Table, TrendingUp, GitCompareArrows, Upload as UploadIcon, ArrowUp, ArrowDown, Minus, Move, UserSearch } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  useAvailableSeedKingdoms,
  useSeedDates,
  useSeedPlayers,
  useSeedKdStats,
  formatCompact,
  type SeedKdStat,
} from '@/lib/supabase/use-kingdom-seeds';
import SeedsUpload from './SeedsUpload';
import { SeedBadge } from './SeedBadge';
import { seedAssignment } from '@/lib/kingdom/seed';
import { MIG_FROM_DATE, MIG_POWER_FLOOR_M_DEFAULT } from '@/lib/kingdom/migrations';
import { createClient } from '@/lib/supabase/client';
import { KD_POOLS, poolFilter, type KdPoolKey } from '@/lib/kingdom/kd-pools';

type SortField = 'rank_in_kd' | 'name' | 'power' | 'kp' | 'cityhall';
type SortDir = 'asc' | 'desc';

const METRICS = [
  { key: 'power_400', label: 'Top 400 Power', color: '#818cf8' },
  { key: 'total_kp',  label: 'Total KP',      color: '#f87171' },
] as const;

const KD_COLORS = ['#818cf8', '#f87171', '#34d399', '#fbbf24', '#fb923c', '#a78bfa', '#22d3ee', '#f472b6', '#a3e635', '#fb7185'];

// Default kingdom to pre-select in the highlight dropdown.
const DEFAULT_HIGHLIGHT_KD = 3923;

// "T5" floor — players ≥45M power are treated as T5-capable for the recap.
const T5_POWER_FLOOR = 45_000_000;

type TabType = 'table' | 'charts' | 'comparison' | 'migrations' | 'search' | 'upload';
const VALID_TABS: TabType[] = ['table', 'charts', 'comparison', 'migrations', 'search', 'upload'];

/** One row of the Migrations tab — a player who appears in the To scan with
 *  a different (or unknown) kingdom_id compared to the From scan.
 *  fromKd = null means the player wasn't in the From scan at all → "new joiner".
 *  In that case fromPower / fromKp are 0 and deltaPower equals toPower. */
interface MigrationRow {
  player_id: number;
  name: string;
  fromKd: number | null;
  toKd: number;
  fromPower: number;
  toPower: number;
  fromKp: number;
  toKp: number;
  deltaPower: number;
  isNewJoiner: boolean;
  /** First scan_date the player was seen in `toKd` (or first scan ever for
   *  new joiners). Used to render a "moved on YYYY-MM-DD" badge. */
  migratedAt: string | null;
}

export default function KingdomStats({
  pool: poolKey = 'current',
  basePath = '/kingdom/kingdom-stats',
}: {
  /** Which KD pool this page operates on. Filters the dropdown lists and the
   *  cross-KD queries so the preview pool (3929–3944) doesn't bleed into the
   *  current pool views and vice versa. */
  pool?: KdPoolKey;
  /** Used for the tab → URL mapping. Preview pool lives on a different route. */
  basePath?: string;
}) {
  const pool = KD_POOLS[poolKey];
  const kdFilter = useMemo(() => poolFilter(pool), [pool]);

  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get('tab');
  // Preview pool only exposes Table + Comparison; fall back to Table if the
  // URL points at a tab that's hidden for this pool.
  const activeTab: TabType = (() => {
    const candidate = (VALID_TABS.includes(rawTab as TabType) ? rawTab : 'table') as TabType;
    if (pool.allowedTabs && !pool.allowedTabs.has(candidate)) return 'table';
    return candidate;
  })();
  const setActiveTab = useCallback((tab: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'table') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : basePath, { scroll: false });
  }, [searchParams, router, basePath]);

  // Table state
  const [selectedKingdom, setSelectedKingdom] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('rank_in_kd');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Chart state
  const [chartKingdoms, setChartKingdoms] = useState<Set<number>>(new Set());
  const [chartMetric, setChartMetric] = useState<'power_400' | 'total_kp'>('power_400');
  const [chartDateFrom, setChartDateFrom] = useState<string>('');
  const [chartDateTo, setChartDateTo] = useState<string>('');
  const [hoveredKd, setHoveredKd] = useState<number | null>(null);

  // Comparison state
  const [comparisonFromDate, setComparisonFromDate] = useState<string>('');
  const [comparisonToDate, setComparisonToDate] = useState<string>('');
  const [compSortField, setCompSortField] = useState<'power_400' | 'total_kp' | 'power_rank' | 'kp_rank' | 'kingdom_id'>('power_400');
  const [compSortDir, setCompSortDir] = useState<SortDir>('desc');
  const [highlightedKingdom, setHighlightedKingdom] = useState<number | null>(DEFAULT_HIGHLIGHT_KD);

  // Migrations tab state
  const [migFromDate, setMigFromDate] = useState<string>('');
  const [migToDate, setMigToDate] = useState<string>('');
  const [migPowerFloorM, setMigPowerFloorM] = useState<number>(MIG_POWER_FLOOR_M_DEFAULT);
  const [migrations, setMigrations] = useState<MigrationRow[]>([]);
  const [migLoading, setMigLoading] = useState(false);
  const [migError, setMigError] = useState<string | null>(null);
  const [migSearch, setMigSearch] = useState('');
  const [migSortField, setMigSortField] = useState<'name' | 'fromKd' | 'toKd' | 'toPower' | 'toKp' | 'migratedAt'>('migratedAt');
  const [migSortDir, setMigSortDir] = useState<SortDir>('desc');

  // Refresh trigger to re-fetch after an upload
  const [refreshKey, setRefreshKey] = useState(0);

  // Data
  const { kingdoms, loading: loadingKingdoms } = useAvailableSeedKingdoms(kdFilter);
  const { dates, loading: loadingDates } = useSeedDates(selectedKingdom);
  const { dates: allDates } = useSeedDates(null);
  const { players, loading: loadingPlayers } = useSeedPlayers(selectedKingdom, selectedDate);

  const chartKingdomIds = useMemo(() => Array.from(chartKingdoms), [chartKingdoms]);
  const { stats: chartStats, loading: loadingChart } = useSeedKdStats(
    chartKingdomIds,
    chartDateFrom || null,
    chartDateTo || null,
  );

  // Range fetch covers both From and To (inclusive). We then filter client-side
  // to those two specific dates for ranking + delta computation.
  const compRangeFrom = useMemo(() => {
    if (!comparisonToDate) return null;
    if (!comparisonFromDate) return comparisonToDate;
    return comparisonFromDate < comparisonToDate ? comparisonFromDate : comparisonToDate;
  }, [comparisonFromDate, comparisonToDate]);
  const compRangeTo = useMemo(() => {
    if (!comparisonToDate) return null;
    if (!comparisonFromDate) return comparisonToDate;
    return comparisonFromDate > comparisonToDate ? comparisonFromDate : comparisonToDate;
  }, [comparisonFromDate, comparisonToDate]);

  const { stats: compStats, loading: loadingComparison } = useSeedKdStats(
    kingdoms,
    compRangeFrom,
    compRangeTo,
  );

  // Auto-select kingdom from URL (?kd=) on first load, or fall back to the first
  // available KD. The URL takes precedence so a shared link opens on the right KD.
  React.useEffect(() => {
    if (kingdoms.length === 0 || selectedKingdom) return;
    const fromUrl = Number(searchParams.get('kd'));
    if (fromUrl && kingdoms.includes(fromUrl)) setSelectedKingdom(fromUrl);
    else setSelectedKingdom(kingdoms[0]);
    setChartKingdoms(new Set(kingdoms));
  }, [kingdoms, selectedKingdom, searchParams]);

  // Update the URL when the user picks a different KD in the Table tab.
  const updateSelectedKingdom = useCallback((kd: number) => {
    setSelectedKingdom(kd);
    setSelectedDate(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('kd', String(kd));
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  React.useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  React.useEffect(() => {
    // Default: To = latest date, From = second-latest (if any)
    if (allDates.length > 0 && !comparisonToDate) {
      setComparisonToDate(allDates[0]);
      if (allDates.length > 1 && !comparisonFromDate) setComparisonFromDate(allDates[1]);
    }
  }, [allDates, comparisonToDate, comparisonFromDate]);

  // Migrations tab — From is fixed to MIG_FROM_DATE; To always tracks the
  // most recent scan available so the user is comparing "since seed day to today".
  React.useEffect(() => {
    if (migFromDate !== MIG_FROM_DATE) setMigFromDate(MIG_FROM_DATE);
    if (allDates.length > 0 && migToDate !== allDates[0]) setMigToDate(allDates[0]);
  }, [allDates, migFromDate, migToDate]);

  // Fetch migrations: players that appear in both scans (>= power floor) but
  // with a different kingdom_id between them. Cross-KD scan means we have to
  // pull every row for both dates with no kingdom filter.
  React.useEffect(() => {
    if (activeTab !== 'migrations') return;
    if (!migFromDate || !migToDate || migFromDate === migToDate) {
      setMigrations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setMigLoading(true);
      setMigError(null);
      try {
        const sb = createClient();
        const floor = migPowerFloorM * 1_000_000;
        // Pull both scans' players at-or-above the floor, paginating past 1000.
        // Restrict to the active pool's KD range so the preview pool (3929+)
        // doesn't pollute the current-pool migrations with spurious "new
        // joiner" rows (and vice versa).
        const pull = async (date: string) => {
          const all: { player_id: number; kingdom_id: number; name: string; power: number; kp: number }[] = [];
          let from = 0;
          while (true) {
            const { data, error } = await sb
              .from('seeds_kd_players')
              .select('player_id, kingdom_id, name, power, kp')
              .eq('scan_date', date)
              .gte('power', floor)
              .gte('kingdom_id', pool.min)
              .lte('kingdom_id', pool.max)
              .range(from, from + 999);
            if (error) throw error;
            if (!data || data.length === 0) break;
            for (const r of data) all.push(r as typeof all[number]);
            if (data.length < 1000) break;
            from += 1000;
          }
          return all;
        };
        const [fromRows, toRows] = await Promise.all([pull(migFromDate), pull(migToDate)]);
        const fromMap = new Map(fromRows.map((r) => [r.player_id, r] as const));

        const out: MigrationRow[] = [];
        for (const t of toRows) {
          const f = fromMap.get(t.player_id);
          if (f) {
            // Same KD = no migration; skip.
            if (f.kingdom_id === t.kingdom_id) continue;
            out.push({
              player_id: t.player_id,
              name: t.name || f.name,
              fromKd: f.kingdom_id,
              toKd: t.kingdom_id,
              fromPower: f.power,
              toPower: t.power,
              fromKp: f.kp,
              toKp: t.kp,
              deltaPower: t.power - f.power,
              isNewJoiner: false,
              migratedAt: null,
            });
          } else {
            // Not in From scan → starting KD unknown. Could be a brand-new
            // top-400 entry, a return from below the cutoff, or a migrant
            // from a kingdom we didn't scan. Surface them as "new joiners".
            out.push({
              player_id: t.player_id,
              name: t.name,
              fromKd: null,
              toKd: t.kingdom_id,
              fromPower: 0,
              toPower: t.power,
              fromKp: 0,
              toKp: t.kp,
              deltaPower: t.power,
              isNewJoiner: true,
              migratedAt: null,
            });
          }
        }

        // Pull the timeline (player_id, scan_date, kingdom_id) for everyone
        // we've flagged so we can stamp each row with the first scan it
        // shows up in the destination KD (or first appearance for new joiners).
        if (out.length > 0) {
          const playerIds = out.map((r) => r.player_id);
          const BATCH = 500;
          const timeline: { player_id: number; kingdom_id: number; scan_date: string }[] = [];
          for (let i = 0; i < playerIds.length; i += BATCH) {
            const slice = playerIds.slice(i, i + BATCH);
            const { data: tl, error: tlErr } = await sb
              .from('seeds_kd_players')
              .select('player_id, kingdom_id, scan_date')
              .in('player_id', slice)
              .gte('scan_date', migFromDate)
              .lte('scan_date', migToDate);
            if (tlErr) throw tlErr;
            for (const r of tl ?? []) timeline.push(r as typeof timeline[number]);
          }
          // Group by player_id, find first scan in destination KD (or first
          // appearance overall for new joiners).
          const tlByPlayer = new Map<number, { kingdom_id: number; scan_date: string }[]>();
          for (const r of timeline) {
            const arr = tlByPlayer.get(r.player_id) ?? [];
            arr.push({ kingdom_id: r.kingdom_id, scan_date: r.scan_date });
            tlByPlayer.set(r.player_id, arr);
          }
          for (const row of out) {
            const arr = tlByPlayer.get(row.player_id);
            if (!arr || arr.length === 0) continue;
            arr.sort((a, b) => a.scan_date.localeCompare(b.scan_date));
            if (row.isNewJoiner) {
              row.migratedAt = arr[0].scan_date;
            } else {
              // First scan_date where they're already in `toKd`. Equivalent to
              // "moved here at this scan, hadn't been here before that".
              const firstInDest = arr.find((x) => x.kingdom_id === row.toKd);
              row.migratedAt = firstInDest?.scan_date ?? null;
            }
          }
        }

        if (!cancelled) setMigrations(out);
      } catch (e) {
        if (!cancelled) setMigError(e instanceof Error ? e.message : 'Failed to load migrations');
      } finally {
        if (!cancelled) setMigLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, migFromDate, migToDate, migPowerFloorM, pool.min, pool.max]);

  // Force re-fetch by remounting on refresh — easier than threading refetch through hooks
  // (used after a successful upload)
  const handleUploaded = useCallback(() => {
    setRefreshKey(k => k + 1);
    setActiveTab('table');
  }, [setActiveTab]);

  // Filter & sort players
  const filtered = useMemo(() => {
    let data = [...players];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(p => p.name.toLowerCase().includes(q) || p.player_id.toString().includes(q));
    }
    data.sort((a, b) => {
      const av = sortField === 'name' ? a.name.toLowerCase() : (a[sortField] || 0);
      const bv = sortField === 'name' ? b.name.toLowerCase() : (b[sortField] || 0);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [players, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'name' || field === 'rank_in_kd' ? 'asc' : 'desc'); }
  };

  const toggleChartKingdom = (k: number) => {
    setChartKingdoms(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Pivot stats for multi-KD chart: { scan_date, "KD 3908": value, ... }
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const s of chartStats) {
      const row = byDate.get(s.scan_date) || { scan_date: s.scan_date };
      row[`KD ${s.kingdom_id}`] = s[chartMetric] as number;
      byDate.set(s.scan_date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => (a.scan_date as string).localeCompare(b.scan_date as string));
  }, [chartStats, chartMetric]);

  // Sort lines by latest metric value desc (legend ordering)
  const sortedChartKingdomIds = useMemo(() => {
    if (chartStats.length === 0) return chartKingdomIds;
    const latestVal = new Map<number, number>();
    const latestDate = new Map<number, string>();
    for (const s of chartStats) {
      const prev = latestDate.get(s.kingdom_id);
      if (!prev || s.scan_date > prev) {
        latestDate.set(s.kingdom_id, s.scan_date);
        latestVal.set(s.kingdom_id, s[chartMetric] as number);
      }
    }
    return [...chartKingdomIds].sort((a, b) => (latestVal.get(b) || 0) - (latestVal.get(a) || 0));
  }, [chartKingdomIds, chartStats, chartMetric]);

  const allChartDates = useMemo(() => {
    const s = new Set(chartStats.map(a => a.scan_date));
    return Array.from(s).sort();
  }, [chartStats]);

  // Y-axis domain — auto-zoom around min/max with 5% padding so 32 lines
  // don't compress to a thick band near the top.
  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const vals: number[] = [];
    for (const row of chartData) {
      for (const k of chartKingdomIds) {
        const v = row[`KD ${k}`];
        if (typeof v === 'number') vals.push(v);
      }
    }
    if (vals.length === 0) return ['auto', 'auto'];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || max * 0.1 || 1;
    return [Math.max(0, Math.floor(min - span * 0.05)), Math.ceil(max + span * 0.05)];
  }, [chartData, chartKingdomIds]);

  // Top N kingdoms by current metric at the latest available date — used by
  // the quick-filter buttons.
  const topNKingdoms = useCallback((n: number): number[] => {
    if (chartStats.length === 0) return kingdoms.slice(0, n);
    const latestVal = new Map<number, number>();
    const latestDate = new Map<number, string>();
    for (const s of chartStats) {
      const prev = latestDate.get(s.kingdom_id);
      if (!prev || s.scan_date > prev) {
        latestDate.set(s.kingdom_id, s.scan_date);
        latestVal.set(s.kingdom_id, s[chartMetric] as number);
      }
    }
    return [...kingdoms]
      .sort((a, b) => (latestVal.get(b) || 0) - (latestVal.get(a) || 0))
      .slice(0, n);
  }, [chartStats, chartMetric, kingdoms]);

  // Sorter for comparison rows — used both for the displayed To-date ranking
  // and for computing the From-date rank (so we compare like-for-like).
  const compSorter = useCallback((a: SeedKdStat, b: SeedKdStat) => {
    const av = a[compSortField] || 0;
    const bv = b[compSortField] || 0;
    if (av < bv) return compSortDir === 'asc' ? -1 : 1;
    if (av > bv) return compSortDir === 'asc' ? 1 : -1;
    return 0;
  }, [compSortField, compSortDir]);

  // Ranking @ To date — one row per KD, sorted by the chosen field/direction
  const comparisonRows = useMemo(() => {
    if (compStats.length === 0 || !comparisonToDate) return [];
    const forDate = compStats.filter(s => s.scan_date === comparisonToDate);
    const byKd = new Map<number, SeedKdStat>();
    for (const s of forDate) if (!byKd.has(s.kingdom_id)) byKd.set(s.kingdom_id, s);
    return Array.from(byKd.values()).sort(compSorter);
  }, [compStats, comparisonToDate, compSorter]);

  // Rank lookup @ From date (1-indexed). Empty if no From date selected.
  const fromRanks = useMemo(() => {
    const m = new Map<number, number>();
    if (!comparisonFromDate || compStats.length === 0) return m;
    const forDate = compStats.filter(s => s.scan_date === comparisonFromDate);
    const byKd = new Map<number, SeedKdStat>();
    for (const s of forDate) if (!byKd.has(s.kingdom_id)) byKd.set(s.kingdom_id, s);
    Array.from(byKd.values())
      .sort(compSorter)
      .forEach((r, i) => m.set(r.kingdom_id, i + 1));
    return m;
  }, [compStats, comparisonFromDate, compSorter]);

  // Summary card for the highlighted kingdom — its rank+value at From and at To.
  const highlightedInfo = useMemo(() => {
    if (!highlightedKingdom) return null;
    const toIdx = comparisonRows.findIndex(r => r.kingdom_id === highlightedKingdom);
    if (toIdx === -1) return null;
    const toRow = comparisonRows[toIdx];
    const toValue = (toRow[compSortField] as number) || 0;

    const fromRow = comparisonFromDate
      ? compStats.find(s => s.scan_date === comparisonFromDate && s.kingdom_id === highlightedKingdom)
      : undefined;
    const fromRank = fromRanks.get(highlightedKingdom) ?? null;
    const fromValue = fromRow ? ((fromRow[compSortField] as number) || 0) : null;

    return {
      kd: highlightedKingdom,
      toRank: toIdx + 1,
      toValue,
      fromRank,
      fromValue,
    };
  }, [highlightedKingdom, comparisonRows, fromRanks, compStats, comparisonFromDate, compSortField]);

  const handleCompSort = (field: typeof compSortField) => {
    if (compSortField === field) setCompSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setCompSortField(field);
      // ranks ascending by default, values descending
      setCompSortDir(field === 'power_rank' || field === 'kp_rank' || field === 'kingdom_id' ? 'asc' : 'desc');
    }
  };

  const isLoading = loadingKingdoms || loadingDates || loadingPlayers;

  return (
    <div key={refreshKey} className="min-h-screen p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <BarChart3 size={28} className="text-green-500" />
            Kingdom Stats
            {poolKey === 'preview' && (
              <span className="text-xs uppercase tracking-wider px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                Preview pool
              </span>
            )}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {pool.label} · KD {pool.min}–{pool.max} · Seeds scan stats
          </p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {poolKey === 'current' ? (
            <a
              href="/kingdom/preview-pool"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-medium hover:bg-amber-500/25 transition-colors"
              title={`Preview pool view — KD ${KD_POOLS.preview.min}–${KD_POOLS.preview.max}`}
            >
              Preview pool →
            </a>
          ) : (
            <a
              href="/kingdom/kingdom-stats"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-colors"
              title={`Current pool view — KD ${KD_POOLS.current.min}–${KD_POOLS.current.max}`}
            >
              ← Current pool
            </a>
          )}
          <a
            href="/kingdom/ready-to-migrate"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-medium hover:bg-amber-500/25 transition-colors"
            title="Show players (gov_id ≥ 205000000) across all kingdoms with their seed band"
          >
            Possible candidates →
          </a>
          <a
            href="/kingdom/cross-season"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/25 transition-colors"
            title="Cross-season scan uploads + cross-season player browser"
          >
            Cross-season →
          </a>
        </div>
      </div>

      {/* Tab toggle — preview pool only shows Table + Comparison. */}
      <div className="flex rounded-lg border border-[var(--border)] overflow-hidden mb-6 w-fit">
        <TabButton active={activeTab === 'table'}      onClick={() => setActiveTab('table')}      icon={<Table size={16} />}            label="Table" />
        {(!pool.allowedTabs || pool.allowedTabs.has('charts')) && (
          <TabButton active={activeTab === 'charts'}     onClick={() => setActiveTab('charts')}     icon={<TrendingUp size={16} />}       label="Charts" />
        )}
        <TabButton active={activeTab === 'comparison'} onClick={() => setActiveTab('comparison')} icon={<GitCompareArrows size={16} />} label="Comparison" />
        {(!pool.allowedTabs || pool.allowedTabs.has('migrations')) && (
          <TabButton active={activeTab === 'migrations'} onClick={() => setActiveTab('migrations')} icon={<Move size={16} />}             label="Migrations" />
        )}
        {(!pool.allowedTabs || pool.allowedTabs.has('search')) && (
          <TabButton active={activeTab === 'search'}     onClick={() => setActiveTab('search')}     icon={<UserSearch size={16} />}       label="Search all kingdoms" />
        )}
        {(!pool.allowedTabs || pool.allowedTabs.has('upload')) && (
          <TabButton active={activeTab === 'upload'}     onClick={() => setActiveTab('upload')}     icon={<UploadIcon size={16} />}       label="Upload" />
        )}
      </div>

      {/* ═══ TABLE ═══ */}
      {activeTab === 'table' && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <select
              value={selectedKingdom || ''}
              onChange={e => updateSelectedKingdom(Number(e.target.value))}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              {loadingKingdoms && <option>Loading...</option>}
              {kingdoms.map(k => <option key={k} value={k}>KD {k}</option>)}
            </select>

            <select
              value={selectedDate || ''}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              {loadingDates && <option>Loading...</option>}
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search player..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)]"
              />
            </div>

          </div>

          {!isLoading && players.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <SummaryCard label="Players" value={players.length.toLocaleString()} color="text-sky-400" />
              <SummaryCard label="Total Power" value={formatCompact(players.reduce((s, p) => s + p.power, 0))} color="text-indigo-400" />
              <SummaryCard label="Total KP" value={formatCompact(players.reduce((s, p) => s + p.kp, 0))} color="text-red-400" />
              <SummaryCard label="Avg City Hall" value={(players.reduce((s, p) => s + p.cityhall, 0) / Math.max(1, players.length)).toFixed(1)} color="text-amber-400" />
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-[var(--text-muted)]">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-muted)]">No data available</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
                        <HeaderCell label="#"       field="rank_in_kd" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                        <HeaderCell label="Name"    field="name"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <HeaderCell label="Power"   field="power"    sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="KP"      field="kp"       sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="CH"      field="cityhall" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p => (
                        <tr key={p.player_id} className="border-b border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
                          <td className="px-3 py-2.5 text-[var(--text-muted)] tabular-nums">{p.rank_in_kd}</td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs tabular-nums">{p.player_id}</td>
                          <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">{p.name}</td>
                          <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(p.power)}</td>
                          <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(p.kp)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-400 tabular-nums">{p.cityhall}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
                  {filtered.length} player{filtered.length !== 1 ? 's' : ''}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ═══ COMPARISON ═══ */}
      {activeTab === 'comparison' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-[var(--text-muted)]">From</label>
            <select
              value={comparisonFromDate}
              onChange={e => {
                const v = e.target.value;
                setComparisonFromDate(v);
                // If new From is later than current To, push To to match.
                if (v && comparisonToDate && v > comparisonToDate) setComparisonToDate(v);
              }}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              <option value="">— none —</option>
              {allDates.filter(d => !comparisonToDate || d <= comparisonToDate).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label className="text-xs text-[var(--text-muted)]">To</label>
            <select
              value={comparisonToDate}
              onChange={e => {
                const v = e.target.value;
                setComparisonToDate(v);
                // If new To is earlier than current From, clear From.
                if (v && comparisonFromDate && v < comparisonFromDate) setComparisonFromDate('');
              }}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              {allDates.length === 0 && <option>Loading...</option>}
              {allDates.filter(d => !comparisonFromDate || d >= comparisonFromDate).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label className="text-xs text-[var(--text-muted)] ml-2">Highlight</label>
            <select
              value={highlightedKingdom ?? ''}
              onChange={e => setHighlightedKingdom(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              <option value="">— none —</option>
              {kingdoms.map(k => <option key={k} value={k}>KD {k}</option>)}
            </select>
            {highlightedInfo && (
              <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                <span className="font-semibold">KD {highlightedInfo.kd}</span>
                {highlightedInfo.fromRank !== null && highlightedInfo.fromValue !== null && (
                  <span className="text-amber-300/80">
                    #{highlightedInfo.fromRank} · {formatCompact(highlightedInfo.fromValue)}
                    <span className="mx-1 text-amber-200/50">→</span>
                  </span>
                )}
                <span>#{highlightedInfo.toRank} · {formatCompact(highlightedInfo.toValue)}</span>
              </div>
            )}
            <span className="text-sm text-[var(--text-muted)]">
              {comparisonRows.length} kingdom{comparisonRows.length !== 1 ? 's' : ''}
              {comparisonFromDate && fromRanks.size > 0 && ` · Δ vs ${comparisonFromDate}`}
            </span>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
            {loadingComparison ? (
              <div className="p-12 text-center text-[var(--text-muted)]">Loading...</div>
            ) : comparisonRows.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-muted)]">No data for this date</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">#</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">Δ</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Seed</th>
                      <CompHeader label="Kingdom"    field="kingdom_id" sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} />
                      <CompHeader label="Power 400"  field="power_400"  sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                      <CompHeader label="Total KP"   field="total_kp"   sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                      <CompHeader label="Power Rank" field="power_rank" sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                      <CompHeader label="KP Rank"    field="kp_rank"    sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, i) => {
                      const pos = i + 1;
                      const seed = seedAssignment(pos);
                      const fromRank = fromRanks.get(row.kingdom_id);
                      const isHighlighted = highlightedKingdom !== null && row.kingdom_id === highlightedKingdom;
                      // Red divider between the 16th (last B) and 17th (first C) row —
                      // marks the boundary between top half (A+B bands) and bottom half (C+D).
                      const isHalfBoundary = pos === 16;
                      return (
                        <tr
                          key={row.kingdom_id}
                          className={`transition-colors ${
                            isHalfBoundary
                              ? 'border-b-2 border-red-500/60'
                              : 'border-b border-[var(--border)]'
                          } ${
                            isHighlighted
                              ? 'bg-amber-500/10 hover:bg-amber-500/15 ring-1 ring-inset ring-amber-500/30'
                              : 'hover:bg-[var(--background-secondary)]'
                          }`}
                        >
                          <td className="px-4 py-3 text-[var(--text-muted)] font-medium">{pos}</td>
                          <td className="px-3 py-3 text-center"><DeltaCell from={fromRank} to={pos} hasFrom={fromRanks.size > 0} /></td>
                          <td className="px-3 py-3 text-center"><SeedBadge seed={seed} /></td>
                          <td className="px-4 py-3 font-semibold text-[var(--foreground)]">
                            <span
                              className="inline-block w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: KD_COLORS[kingdoms.indexOf(row.kingdom_id) % KD_COLORS.length] }}
                            />
                            KD {row.kingdom_id}
                          </td>
                          <td className="px-4 py-3 text-right text-indigo-400 font-semibold tabular-nums">{(row.power_400 || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-red-400 tabular-nums">{(row.total_kp || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-[var(--text-secondary)] tabular-nums">{row.power_rank || '–'}</td>
                          <td className="px-4 py-3 text-right text-[var(--text-secondary)] tabular-nums">{row.kp_rank || '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CHARTS ═══ */}
      {activeTab === 'charts' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-[var(--text-muted)]">Kingdoms</div>
                  <div className="flex gap-1">
                    <button onClick={() => setChartKingdoms(new Set(kingdoms))} className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors">All</button>
                    <button onClick={() => setChartKingdoms(new Set(topNKingdoms(8)))} className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors">Top 8</button>
                    <button onClick={() => setChartKingdoms(new Set(topNKingdoms(16)))} className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors">Top 16</button>
                    <button onClick={() => setChartKingdoms(new Set())} className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors">None</button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap max-w-2xl">
                  {kingdoms.map((k, i) => (
                    <button
                      key={k}
                      onClick={() => toggleChartKingdom(k)}
                      onMouseEnter={() => setHoveredKd(k)}
                      onMouseLeave={() => setHoveredKd(null)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                        chartKingdoms.has(k)
                          ? 'border-transparent text-white'
                          : 'border-[var(--border)] text-[var(--text-muted)]'
                      }`}
                      style={chartKingdoms.has(k) ? { backgroundColor: KD_COLORS[i % KD_COLORS.length] } : {}}
                    >
                      KD {k}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-[var(--text-muted)] mb-2">Metric</div>
                <div className="flex gap-2">
                  {METRICS.map(m => (
                    <button
                      key={m.key}
                      onClick={() => setChartMetric(m.key)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        chartMetric === m.key
                          ? 'border-transparent text-white'
                          : 'border-[var(--border)] text-[var(--text-muted)]'
                      }`}
                      style={chartMetric === m.key ? { backgroundColor: m.color } : {}}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-[var(--text-muted)] mb-2">Date Range</div>
                <div className="flex items-center gap-2">
                  <select
                    value={chartDateFrom}
                    onChange={e => setChartDateFrom(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs"
                  >
                    <option value="">All (from)</option>
                    {allChartDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-[var(--text-muted)] text-xs">to</span>
                  <select
                    value={chartDateTo}
                    onChange={e => setChartDateTo(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs"
                  >
                    <option value="">All (to)</option>
                    {allChartDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              {METRICS.find(m => m.key === chartMetric)?.label}
            </h2>

            {loadingChart ? (
              <div className="h-[480px] flex items-center justify-center text-[var(--text-muted)]">Loading...</div>
            ) : chartData.length === 0 ? (
              <div className="h-[480px] flex items-center justify-center text-[var(--text-muted)]">No historical data yet</div>
            ) : (
              <div className="h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="scan_date"
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      domain={yDomain}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      tickFormatter={formatCompact}
                    />
                    <Tooltip content={<TwoColTooltip />} />
                    <Legend />
                    {sortedChartKingdomIds.map((k) => {
                      const isHovered = hoveredKd === k;
                      const dimmed = hoveredKd !== null && !isHovered;
                      return (
                        <Line
                          key={k}
                          type="monotone"
                          dataKey={`KD ${k}`}
                          name={`KD ${k}`}
                          stroke={KD_COLORS[kingdoms.indexOf(k) % KD_COLORS.length]}
                          strokeWidth={isHovered ? 3 : 1.5}
                          strokeOpacity={dimmed ? 0.12 : 1}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.length > 0 && (
              <div className="mt-4 text-xs text-[var(--text-muted)]">
                {chartData.length} date{chartData.length > 1 ? 's' : ''} &middot; {chartKingdomIds.length} kingdom{chartKingdomIds.length > 1 ? 's' : ''} &middot; <span className="text-[var(--text-secondary)]">hover a KD button above to highlight</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MIGRATIONS ═══ */}
      {activeTab === 'migrations' && (
        <MigrationsView
          allDates={allDates}
          migFromDate={migFromDate}
          setMigFromDate={setMigFromDate}
          migToDate={migToDate}
          setMigToDate={setMigToDate}
          migPowerFloorM={migPowerFloorM}
          setMigPowerFloorM={setMigPowerFloorM}
          migrations={migrations}
          loading={migLoading}
          error={migError}
          search={migSearch}
          setSearch={setMigSearch}
          sortField={migSortField}
          setSortField={setMigSortField}
          sortDir={migSortDir}
          setSortDir={setMigSortDir}
          recapMin={pool.min}
          recapMax={pool.max}
        />
      )}

      {/* ═══ SEARCH ALL KINGDOMS ═══ */}
      {activeTab === 'search' && <SearchAllKingdomsView />}

      {/* ═══ UPLOAD ═══ */}
      {activeTab === 'upload' && (
        <SeedsUpload onUploaded={handleUploaded} />
      )}
    </div>
  );
}

// Custom 2-column chart tooltip, items sorted by value desc.
type TooltipPayloadItem = { name?: string | number; value?: number | string; color?: string };
type TooltipProps = { active?: boolean; payload?: TooltipPayloadItem[]; label?: string | number };

function TwoColTooltip(props: TooltipProps) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;
  const items = [...payload].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const renderRow = (it: TooltipPayloadItem, i: number) => (
    <div key={i} className="flex items-center justify-between gap-4 leading-tight">
      <span className="truncate" style={{ color: it.color }}>{String(it.name ?? '')}</span>
      <span className="tabular-nums text-[var(--foreground)]">{formatCompact(Number(it.value) || 0)}</span>
    </div>
  );
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-card)]/95 backdrop-blur p-2.5 text-xs shadow-lg">
      <div className="text-[var(--text-muted)] mb-1.5">Date: {String(label ?? '')}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 min-w-[280px]">
        <div className="space-y-0.5">{left.map(renderRow)}</div>
        <div className="space-y-0.5">{right.map(renderRow)}</div>
      </div>
    </div>
  );
}


function DeltaCell({ from, to, hasFrom }: { from: number | undefined; to: number; hasFrom: boolean }) {
  if (!hasFrom) return <span className="text-[var(--text-muted)]">–</span>;
  if (from === undefined) {
    // KD has no row at the From date — treat as "no comparison available"
    return <span className="text-[var(--text-muted)] text-xs">–</span>;
  }
  const delta = from - to; // positive = moved up (lower rank number)
  if (delta === 0) {
    return <Minus size={14} className="inline text-[var(--text-muted)]" />;
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-400 tabular-nums text-xs">
        <ArrowUp size={12} />{delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-red-400 tabular-nums text-xs">
      <ArrowDown size={12} />{Math.abs(delta)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Migrations tab — players that changed kingdom between two scans.
// ─────────────────────────────────────────────────────────────
type MigSortField = 'name' | 'fromKd' | 'toKd' | 'toPower' | 'toKp' | 'migratedAt';

function MigrationsView({
  migFromDate,
  migToDate,
  migPowerFloorM,
  setMigPowerFloorM,
  migrations,
  loading,
  error,
  search,
  setSearch,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
  recapMin,
  recapMax,
}: {
  allDates: string[];
  migFromDate: string;
  setMigFromDate: (v: string) => void;
  migToDate: string;
  setMigToDate: (v: string) => void;
  migPowerFloorM: number;
  setMigPowerFloorM: (n: number) => void;
  migrations: MigrationRow[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  sortField: MigSortField;
  setSortField: (f: MigSortField) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
  /** KD range covered by the recap card. Comes from the active pool config. */
  recapMin: number;
  recapMax: number;
}) {
  const filteredAndSorted = useMemo(() => {
    let data = [...migrations];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        String(m.player_id).includes(q) ||
        String(m.fromKd).includes(q) ||
        String(m.toKd).includes(q),
      );
    }
    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else if (sortField === 'fromKd') cmp = (a.fromKd ?? Number.POSITIVE_INFINITY) - (b.fromKd ?? Number.POSITIVE_INFINITY);
      else if (sortField === 'toPower') cmp = (a.toPower || 0) - (b.toPower || 0);
      else if (sortField === 'toKp')   cmp = (a.toKp   || 0) - (b.toKp   || 0);
      else if (sortField === 'migratedAt') {
        // ISO YYYY-MM-DD sorts lexicographically. Null (no timeline data) goes last.
        const av = a.migratedAt ?? '';
        const bv = b.migratedAt ?? '';
        if (av === bv) cmp = 0;
        else if (!av) cmp = 1;
        else if (!bv) cmp = -1;
        else cmp = av.localeCompare(bv);
      }
      else cmp = (a[sortField] || 0) - (b[sortField] || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return data;
  }, [migrations, search, sortField, sortDir]);

  const handleSort = (f: MigSortField) => {
    if (sortField === f) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(f);
      setSortDir(f === 'name' || f === 'fromKd' || f === 'toKd' ? 'asc' : 'desc');
    }
  };

  // Counts for K23-related migrations + new joiners (highlighting helps spot
  // defections / arrivals at a glance).
  const intoK23 = useMemo(() => filteredAndSorted.filter((m) => m.toKd === DEFAULT_HIGHLIGHT_KD).length, [filteredAndSorted]);
  const outOfK23 = useMemo(() => filteredAndSorted.filter((m) => m.fromKd === DEFAULT_HIGHLIGHT_KD).length, [filteredAndSorted]);
  const newJoiners = useMemo(() => filteredAndSorted.filter((m) => m.isNewJoiner).length, [filteredAndSorted]);

  // ─── T5 (≥45M) net flow per KD across the seeded pool ───
  // For each KD in [recapMin, recapMax] count incoming T5 (arrivals including
  // new joiners) minus outgoing T5 (departures). Ignores the user's sort/search
  // filters — uses the underlying `migrations` array directly so the ranking
  // reflects the full picture for the selected date range. The page-level
  // power floor still bounds the upstream fetch, so the recap notes when that
  // bound would hide some T5 traffic.
  const recap = useMemo(() => {
    const rows = new Map<number, { kd: number; inT5: number; outT5: number }>();
    for (let kd = recapMin; kd <= recapMax; kd++) {
      rows.set(kd, { kd, inT5: 0, outT5: 0 });
    }
    for (const m of migrations) {
      // Player is T5 if their latest-scan power is ≥45M. The same player row
      // contributes one arrival to toKd and one departure from fromKd (if any).
      if (m.toPower < T5_POWER_FLOOR) continue;
      const inRow = rows.get(m.toKd);
      if (inRow) inRow.inT5 += 1;
      if (m.fromKd != null) {
        const outRow = rows.get(m.fromKd);
        if (outRow) outRow.outT5 += 1;
      }
    }
    const list = [...rows.values()].map((r) => ({ ...r, net: r.inT5 - r.outT5 }));
    list.sort((a, b) => (b.net - a.net) || (b.inT5 - a.inT5) || (a.kd - b.kd));
    return list;
  }, [migrations, recapMin, recapMax]);

  // True when the fetch floor would have dropped some T5 traffic (a player
  // who was <floor at From but ≥45M at To would still surface as a "new joiner",
  // but a player who was ≥45M at From and <floor at To would be missing).
  const recapTruncated = migPowerFloorM > 45;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--text-muted)]">
          Comparing <span className="text-[var(--foreground)] font-mono">{migFromDate}</span>
          {' → '}
          <span className="text-[var(--foreground)] font-mono">{migToDate || '—'}</span>
        </span>

        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          Power ≥
          <input
            type="text"
            inputMode="decimal"
            value={migPowerFloorM}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, '');
              const n = raw === '' ? 0 : Number(raw);
              if (!Number.isNaN(n)) setMigPowerFloorM(Math.max(0, n));
            }}
            className="w-20 px-2 py-1 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm font-mono focus:outline-none"
          />
          <span className="text-xs text-[var(--text-muted)]">M</span>
        </label>

        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by name, gov id, or KD..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)]"
          />
        </div>

        <span className="text-sm text-[var(--text-muted)]">
          {filteredAndSorted.length.toLocaleString()} entr{filteredAndSorted.length === 1 ? 'y' : 'ies'}
          {newJoiners > 0 && <> · <span className="text-cyan-300">{newJoiners} new joiner{newJoiners !== 1 ? 's' : ''}</span></>}
          {intoK23 > 0 && <> · <span className="text-emerald-400">+{intoK23} into KD {DEFAULT_HIGHLIGHT_KD}</span></>}
          {outOfK23 > 0 && <> · <span className="text-red-400">−{outOfK23} out of KD {DEFAULT_HIGHLIGHT_KD}</span></>}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* ─── T5 net flow recap (KD 3897-3928) ─── */}
      {migFromDate && migToDate && migFromDate !== migToDate && migrations.length > 0 && (
        <T5RecapCard recap={recap} truncated={recapTruncated} kdMin={recapMin} kdMax={recapMax} />
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[var(--text-muted)]">Loading…</div>
        ) : !migFromDate || !migToDate || migFromDate === migToDate ? (
          <div className="p-12 text-center text-[var(--text-muted)]">Pick two different scan dates.</div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)]">
            No migrations detected between {migFromDate} and {migToDate} for power ≥ {migPowerFloorM}M.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Player ID</th>
                  <MigHeader label="Name"        field="name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <MigHeader label="From KD"     field="fromKd"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <MigHeader label="To KD"       field="toKd"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <MigHeader label="Power"       field="toPower"    sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <MigHeader label="KP"          field="toKp"       sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <MigHeader label="Migrated"    field="migratedAt" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((m) => {
                  const intoMine = m.toKd === DEFAULT_HIGHLIGHT_KD;
                  const outOfMine = m.fromKd === DEFAULT_HIGHLIGHT_KD;
                  const rowBg = intoMine
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                    : outOfMine
                      ? 'bg-red-500/10 hover:bg-red-500/15'
                      : 'hover:bg-[var(--background-secondary)]';
                  return (
                    <tr key={m.player_id} className={`border-b border-[var(--border)] transition-colors ${rowBg}`}>
                      <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs tabular-nums">{m.player_id}</td>
                      <td className="px-3 py-2.5 text-[var(--foreground)]">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          {m.name}
                          {m.isNewJoiner && (
                            <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold border bg-cyan-500/15 text-cyan-300 border-cyan-500/30" title="Wasn't in the From scan — KD of origin unknown">
                              NEW JOINER
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">
                        {m.fromKd != null ? `KD ${m.fromKd}` : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">KD {m.toKd}</td>
                      <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(m.toPower)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(m.toKp)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.migratedAt ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-500/15 text-amber-300 border-amber-500/30"
                            title={m.isNewJoiner ? `First seen on ${m.migratedAt}` : `First scan in KD ${m.toKd}: ${m.migratedAt}`}
                          >
                            {m.migratedAt}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact ranking card: shows every KD in the seeded pool with its T5 net
// flow (arrivals incl. new joiners − departures). KDs with zero traffic are
// dimmed so the eye lands on the movers first.
function T5RecapCard({
  recap,
  truncated,
  kdMin,
  kdMax,
}: {
  recap: { kd: number; inT5: number; outT5: number; net: number }[];
  truncated: boolean;
  kdMin: number;
  kdMax: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-semibold text-[var(--foreground)]">
            T5 migration ranking — KD {kdMin}–{kdMax}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            T5 = power ≥ {(T5_POWER_FLOOR / 1_000_000).toLocaleString()}M. Net = arrivals (incl. new joiners) − departures.
          </div>
        </div>
        {truncated && (
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300"
            title="Page-level power filter is above 45M, so some T5 movements may be missing from this recap."
          >
            Partial — page floor &gt; 45M
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 p-3">
        {recap.map((r, idx) => {
          const isMine = r.kd === DEFAULT_HIGHLIGHT_KD;
          const positive = r.net > 0;
          const negative = r.net < 0;
          const dimmed = r.inT5 === 0 && r.outT5 === 0;
          const tone = positive
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : negative
              ? 'border-red-500/30 bg-red-500/10 text-red-200'
              : 'border-[var(--border)] bg-[var(--background-secondary)] text-[var(--text-secondary)]';
          return (
            <div
              key={r.kd}
              className={`rounded-lg border px-2 py-1.5 text-xs ${tone} ${dimmed ? 'opacity-50' : ''} ${isMine ? 'ring-1 ring-amber-400/60' : ''}`}
              title={`KD ${r.kd} — +${r.inT5} arrivals, −${r.outT5} departures (rank ${idx + 1})`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">KD {r.kd}</span>
                <span className="font-mono font-bold tabular-nums">
                  {r.net > 0 ? `+${r.net}` : r.net}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)] tabular-nums flex items-center justify-between">
                <span>#{idx + 1}</span>
                <span>
                  <span className="text-emerald-400">+{r.inT5}</span>
                  {' / '}
                  <span className="text-red-400">−{r.outT5}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MigHeader({ label, field, sortField, sortDir, onSort, align = 'left' }: {
  label: string;
  field: MigSortField;
  sortField: MigSortField;
  sortDir: SortDir;
  onSort: (f: MigSortField) => void;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] transition-colors select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
          : <ChevronDown size={14} className="opacity-20" />}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────
// Search all kingdoms — narrow cross-KD lookup.
// Type a name (substring) or gov_id and we surface, per matching player_id,
// only two snapshots: the seed-day baseline (MIG_FROM_DATE) and the latest
// scan available. If those two scans put the player in different kingdoms
// it counts as a migration; otherwise we just show where they are now.
// ─────────────────────────────────────────────────────────────
interface SearchHit {
  scan_date: string;
  kingdom_id: number;
  player_id: number;
  name: string;
  power: number;
  kp: number;
  cityhall: number;
  rank_in_kd: number;
}

function SearchAllKingdomsView() {
  const [query, setQuery] = useState('');
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Resolve the latest scan_date once on mount so the search can target
  // exactly two dates (seed day + most recent).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data, error: e } = await sb
          .from('seeds_kd_stats')
          .select('scan_date')
          .order('scan_date', { ascending: false })
          .limit(1);
        if (e) throw e;
        if (!cancelled) setLatestDate(data?.[0]?.scan_date as string ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to resolve latest scan date');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError('Type at least 2 characters');
      return;
    }
    if (!latestDate) {
      setError('Latest scan not loaded yet, try again in a second.');
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const sb = createClient();
      const isNumeric = /^\d+$/.test(q);
      // Restrict to the two scans we care about — seed day + most recent.
      const dates = Array.from(new Set([MIG_FROM_DATE, latestDate]));
      let req = sb
        .from('seeds_kd_players')
        .select('scan_date, kingdom_id, player_id, name, power, kp, cityhall, rank_in_kd')
        .in('scan_date', dates)
        .order('player_id', { ascending: true })
        .limit(2000);
      if (isNumeric) {
        req = req.or(`player_id.eq.${q},name.ilike.%${q}%`);
      } else {
        req = req.ilike('name', `%${q}%`);
      }
      const { data, error: e } = await req;
      if (e) throw e;
      setHits((data ?? []) as SearchHit[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [query, latestDate]);

  // Group hits by player_id and pick the seed-day + latest snapshots.
  const grouped = useMemo(() => {
    const byPlayer = new Map<number, { fromHit: SearchHit | null; toHit: SearchHit | null }>();
    for (const h of hits) {
      const cur = byPlayer.get(h.player_id) ?? { fromHit: null, toHit: null };
      if (h.scan_date === MIG_FROM_DATE) cur.fromHit = h;
      else if (h.scan_date === latestDate) cur.toHit = h;
      byPlayer.set(h.player_id, cur);
    }
    return Array.from(byPlayer.entries())
      .map(([player_id, v]) => ({ player_id, fromHit: v.fromHit, toHit: v.toHit }))
      // Most actionable first: migrations, then current top-400 players, then the rest.
      .sort((a, b) => {
        const score = (x: typeof a) => {
          if (x.fromHit && x.toHit && x.fromHit.kingdom_id !== x.toHit.kingdom_id) return 0; // migrated
          if (x.toHit) return 1; // currently in top 400
          if (x.fromHit) return 2; // was at seed day, gone now
          return 3;
        };
        const sa = score(a); const sb_ = score(b);
        if (sa !== sb_) return sa - sb_;
        return (b.toHit?.power ?? b.fromHit?.power ?? 0) - (a.toHit?.power ?? a.fromHit?.power ?? 0);
      });
  }, [hits, latestDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[300px] max-w-[480px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
            placeholder="Player name or gov_id…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#4318ff]"
          />
        </div>
        <button
          onClick={() => void runSearch()}
          disabled={loading || query.trim().length < 2}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        {searched && !loading && (
          <span className="text-sm text-[var(--text-muted)]">
            {grouped.length.toLocaleString()} player{grouped.length !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          Comparing <span className="font-mono text-[var(--text-secondary)]">{MIG_FROM_DATE}</span> → <span className="font-mono text-[var(--text-secondary)]">{latestDate ?? '…'}</span>
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {searched && !loading && grouped.length === 0 && !error && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-12 text-center text-[var(--text-muted)]">
          No players match &quot;{query}&quot;.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(({ player_id, fromHit, toHit }) => {
          const migrated = !!(fromHit && toHit && fromHit.kingdom_id !== toHit.kingdom_id);
          const stayed = !!(fromHit && toHit && fromHit.kingdom_id === toHit.kingdom_id);
          const onlyTo = !fromHit && !!toHit;     // appeared after seed day (or was below top 400 then)
          const onlyFrom = !!fromHit && !toHit;   // was on seed day, now off the radar (left top 400)

          // Pick a stable display name (prefer latest, fall back to seed day).
          const displayName = toHit?.name ?? fromHit?.name ?? '—';

          return (
            <div key={player_id} className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[var(--background-secondary)] border-b border-[var(--border)]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base font-semibold text-[var(--foreground)] truncate">{displayName}</span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">id {player_id}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {migrated && fromHit && toHit && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Migrated KD {fromHit.kingdom_id} → KD {toHit.kingdom_id}
                    </span>
                  )}
                  {stayed && toHit && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Still in KD {toHit.kingdom_id}
                    </span>
                  )}
                  {onlyTo && toHit && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" title="Wasn't in the seed-day top 400">
                      New on radar in KD {toHit.kingdom_id}
                    </span>
                  )}
                  {onlyFrom && fromHit && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30" title="Below the top-400 cutoff in the latest scan">
                      Off latest top 400 (was KD {fromHit.kingdom_id})
                    </span>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">Scan date</th>
                      <th className="px-3 py-2 text-left">KD</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-right">Power</th>
                      <th className="px-3 py-2 text-right">KP</th>
                      <th className="px-3 py-2 text-right">CH</th>
                      <th className="px-3 py-2 text-right">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SnapshotRow label="Seed day"   hit={fromHit} dateLabel={MIG_FROM_DATE} />
                    <SnapshotRow label="Now"        hit={toHit}   dateLabel={latestDate ?? '—'} highlight={migrated} />
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SnapshotRow({ label, hit, dateLabel, highlight }: { label: string; hit: SearchHit | null; dateLabel: string; highlight?: boolean }) {
  if (!hit) {
    return (
      <tr className="border-b border-[var(--border)]">
        <td className="px-3 py-2 text-[var(--text-muted)] uppercase tracking-wider text-[10px]">{label}</td>
        <td className="px-3 py-2 text-[var(--text-muted)] text-xs whitespace-nowrap">{dateLabel}</td>
        <td className="px-3 py-2 text-[var(--text-muted)] italic" colSpan={6}>not in top 400</td>
      </tr>
    );
  }
  return (
    <tr className={`border-b border-[var(--border)] ${highlight ? 'bg-amber-500/5' : ''}`}>
      <td className="px-3 py-2 text-[var(--text-muted)] uppercase tracking-wider text-[10px]">{label}</td>
      <td className="px-3 py-2 text-[var(--text-muted)] text-xs whitespace-nowrap">{hit.scan_date}</td>
      <td className={`px-3 py-2 font-medium tabular-nums ${highlight ? 'text-amber-300' : 'text-[var(--foreground)]'}`}>KD {hit.kingdom_id}</td>
      <td className="px-3 py-2 text-[var(--foreground)] truncate max-w-[260px]">{hit.name}</td>
      <td className="px-3 py-2 text-right text-indigo-400 tabular-nums">{formatCompact(hit.power)}</td>
      <td className="px-3 py-2 text-right text-red-400 tabular-nums">{formatCompact(hit.kp)}</td>
      <td className="px-3 py-2 text-right text-amber-400 tabular-nums">{hit.cityhall}</td>
      <td className="px-3 py-2 text-right text-[var(--text-secondary)] tabular-nums">{hit.rank_in_kd}</td>
    </tr>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-[var(--primary)] text-white'
          : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function HeaderCell({ label, field, sortField, sortDir, onSort, align = 'left' }: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] transition-colors select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
          : <ChevronDown size={14} className="opacity-20" />}
      </span>
    </th>
  );
}

function CompHeader({ label, field, sortField, sortDir, onSort, align = 'left' }: {
  label: string;
  field: 'power_400' | 'total_kp' | 'power_rank' | 'kp_rank' | 'kingdom_id';
  sortField: 'power_400' | 'total_kp' | 'power_rank' | 'kp_rank' | 'kingdom_id';
  sortDir: SortDir;
  onSort: (f: 'power_400' | 'total_kp' | 'power_rank' | 'kp_rank' | 'kingdom_id') => void;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] transition-colors select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
          : <ChevronDown size={14} className="opacity-20" />}
      </span>
    </th>
  );
}
