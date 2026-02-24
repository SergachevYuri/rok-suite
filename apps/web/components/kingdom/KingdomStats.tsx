'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, BarChart3, Table, TrendingUp, GitCompareArrows } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  useAvailableKingdoms,
  useKingdomDates,
  useAllDates,
  useKingdomMembers,
  useKingdomAggregates,
  formatCompact,
  type KingdomAggregate,
} from '@/lib/supabase/use-kingdom-members';

type SortField = 'power' | 'kill' | 'collect' | 'help' | 'dead' | 't4' | 't5' | 'name' | 'max_power';
type SortDir = 'asc' | 'desc';

const METRICS = [
  { key: 'total_power', label: 'Total Power', color: '#818cf8' },
  { key: 'total_kill', label: 'Kill Points', color: '#f87171' },
  { key: 'total_collect', label: 'Resources', color: '#34d399' },
  { key: 'total_help', label: 'Helps', color: '#fbbf24' },
] as const;

// Color palette for multi-KD lines
const KD_COLORS = ['#818cf8', '#f87171', '#34d399', '#fbbf24', '#fb923c', '#a78bfa'];

type TabType = 'table' | 'charts' | 'comparison';
const VALID_TABS: TabType[] = ['table', 'charts', 'comparison'];

export default function KingdomStats() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL-synced tab
  const rawTab = searchParams.get('tab');
  const activeTab: TabType = VALID_TABS.includes(rawTab as TabType) ? (rawTab as TabType) : 'table';
  const setActiveTab = useCallback((tab: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'table') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '/kingdom/kingdom-stats', { scroll: false });
  }, [searchParams, router]);

  // Table state
  const [selectedKingdom, setSelectedKingdom] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Chart state
  const [chartKingdoms, setChartKingdoms] = useState<Set<number>>(new Set());
  const [chartMetric, setChartMetric] = useState<string>('total_power');
  const [chartDateFrom, setChartDateFrom] = useState<string>('');
  const [chartDateTo, setChartDateTo] = useState<string>('');

  // Comparison state
  const [comparisonDate, setComparisonDate] = useState<string>('');

  // Data
  const { kingdoms, loading: loadingKingdoms } = useAvailableKingdoms();
  const { dates, loading: loadingDates } = useKingdomDates(selectedKingdom);
  const { dates: allDates, loading: loadingAllDates } = useAllDates();
  const { members, loading: loadingMembers } = useKingdomMembers(selectedKingdom, selectedDate, 400);

  const chartKingdomIds = useMemo(() => Array.from(chartKingdoms), [chartKingdoms]);
  const { aggregates, loading: loadingAggregates } = useKingdomAggregates(
    chartKingdomIds,
    chartDateFrom || null,
    chartDateTo || null,
  );

  // Comparison: fetch all kingdoms for the selected comparison date
  const { aggregates: compAggregates, loading: loadingComparison } = useKingdomAggregates(
    kingdoms,
    comparisonDate || null,
    comparisonDate || null,
  );

  // Auto-select first kingdom
  React.useEffect(() => {
    if (kingdoms.length > 0 && !selectedKingdom) {
      setSelectedKingdom(kingdoms[0]);
      setChartKingdoms(new Set(kingdoms));
    }
  }, [kingdoms, selectedKingdom]);

  React.useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  // Auto-select latest date for comparison
  React.useEffect(() => {
    if (allDates.length > 0 && !comparisonDate) setComparisonDate(allDates[0]);
  }, [allDates, comparisonDate]);

  React.useEffect(() => { setPage(0); }, [search, selectedKingdom, selectedDate, sortField, sortDir]);

  // Sort & filter (already limited to top 400 by the hook)
  const filtered = useMemo(() => {
    let data = [...members];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(m => m.name.toLowerCase().includes(q) || m.id.toString().includes(q));
    }
    data.sort((a, b) => {
      const av = sortField === 'name' ? a.name.toLowerCase() : (a[sortField] || 0);
      const bv = sortField === 'name' ? b.name.toLowerCase() : (b[sortField] || 0);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [members, search, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paged = filtered.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const toggleChartKingdom = (k: number) => {
    setChartKingdoms(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Pivot aggregates for multi-KD chart: { dt, "KD 3921": value, "KD 4041": value }
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const agg of aggregates) {
      const row = byDate.get(agg.dt) || { dt: agg.dt };
      row[`KD ${agg.kingdom_id}`] = agg[chartMetric as keyof KingdomAggregate] as number;
      byDate.set(agg.dt, row);
    }
    return Array.from(byDate.values()).sort((a, b) => (a.dt as string).localeCompare(b.dt as string));
  }, [aggregates, chartMetric]);

  // Chart kingdom IDs sorted by latest total power (desc)
  const sortedChartKingdomIds = useMemo(() => {
    if (aggregates.length === 0) return chartKingdomIds;
    // Get latest date per kingdom, sum power
    const latestPower = new Map<number, number>();
    const latestDate = new Map<number, string>();
    for (const a of aggregates) {
      const prev = latestDate.get(a.kingdom_id);
      if (!prev || a.dt > prev) {
        latestDate.set(a.kingdom_id, a.dt);
        latestPower.set(a.kingdom_id, a.total_power);
      }
    }
    return [...chartKingdomIds].sort((a, b) => (latestPower.get(b) || 0) - (latestPower.get(a) || 0));
  }, [chartKingdomIds, aggregates]);

  // Get all dates across all kingdoms for date range selectors
  const allChartDates = useMemo(() => {
    const s = new Set(aggregates.map(a => a.dt));
    return Array.from(s).sort();
  }, [aggregates]);

  // Comparison ranking data: one row per kingdom, sorted by total power desc
  const comparisonRows = useMemo(() => {
    if (compAggregates.length === 0) return [];
    // Filter to the selected comparison date (should already be filtered, but be safe)
    const forDate = comparisonDate
      ? compAggregates.filter(a => a.dt === comparisonDate)
      : compAggregates;
    // One row per kingdom
    const byKd = new Map<number, KingdomAggregate>();
    for (const a of forDate) {
      // If multiple dates, take the latest
      if (!byKd.has(a.kingdom_id)) byKd.set(a.kingdom_id, a);
    }
    return Array.from(byKd.values()).sort((a, b) => b.total_power - a.total_power);
  }, [compAggregates, comparisonDate]);

  const isLoading = loadingKingdoms || loadingDates || loadingMembers;

  return (
    <div className="min-h-screen p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <BarChart3 size={28} className="text-green-500" />
          Kingdom Stats
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Top 400 member statistics from Lilith Game Tools</p>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-lg border border-[var(--border)] overflow-hidden mb-6 w-fit">
        <button
          onClick={() => setActiveTab('table')}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeTab === 'table' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
        >
          <Table size={16} /> Table
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeTab === 'charts' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
        >
          <TrendingUp size={16} /> Charts
        </button>
        <button
          onClick={() => setActiveTab('comparison')}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeTab === 'comparison' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
        >
          <GitCompareArrows size={16} /> Comparison
        </button>
      </div>

      {/* ═══ TABLE VIEW ═══ */}
      {activeTab === 'table' && (
        <>
          {/* Table controls */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <select
              value={selectedKingdom || ''}
              onChange={e => { setSelectedKingdom(Number(e.target.value)); setSelectedDate(null); }}
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

          {/* Summary cards */}
          {!isLoading && members.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <SummaryCard label="Top 400 Members" value={members.length.toLocaleString()} color="text-sky-400" />
              <SummaryCard label="Total Power" value={formatCompact(members.reduce((s, m) => s + m.power, 0))} color="text-indigo-400" />
              <SummaryCard label="Total Kill Points" value={formatCompact(members.reduce((s, m) => s + m.kill, 0))} color="text-red-400" />
              <SummaryCard label="Total Gathered" value={formatCompact(members.reduce((s, m) => s + m.collect, 0))} color="text-emerald-400" />
            </div>
          )}

          {/* Table */}
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
                        <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">#</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                        <HeaderCell label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <HeaderCell label="Power" field="power" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="Kill Points" field="kill" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="T4 Kills" field="t4" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="T5 Kills" field="t5" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="Gathered" field="collect" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="Helps" field="help" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <HeaderCell label="Deaths" field="dead" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((m, i) => (
                        <tr key={m.id} className="border-b border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
                          <td className="px-3 py-2.5 text-[var(--text-muted)]">{page * rowsPerPage + i + 1}</td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs tabular-nums">{m.id}</td>
                          <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">{m.name}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--foreground)] tabular-nums">{formatCompact(m.power)}</td>
                          <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(m.kill)}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatCompact(m.t4)}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatCompact(m.t5)}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-400 tabular-nums">{formatCompact(m.collect)}</td>
                          <td className="px-3 py-2.5 text-right text-amber-400 tabular-nums">{formatCompact(m.help)}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-muted)] tabular-nums">{formatCompact(m.dead)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span>{filtered.length} of top 400</span>
                    <select
                      value={rowsPerPage}
                      onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                      className="px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs"
                    >
                      {[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded hover:bg-[var(--background-secondary)] disabled:opacity-30 text-[var(--text-secondary)]">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-3 py-1 text-sm text-[var(--foreground)]">{page + 1} / {totalPages || 1}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-[var(--background-secondary)] disabled:opacity-30 text-[var(--text-secondary)]">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ═══ COMPARISON VIEW ═══ */}
      {activeTab === 'comparison' && (
        <div className="space-y-4">
          {/* Date selector */}
          <div className="flex items-center gap-3">
            <select
              value={comparisonDate}
              onChange={e => setComparisonDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              {allDates.length === 0 && <option>Loading...</option>}
              {allDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-sm text-[var(--text-muted)]">
              {comparisonRows.length} kingdom{comparisonRows.length !== 1 ? 's' : ''} compared
            </span>
          </div>

          {/* Comparison table */}
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Kingdom</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Power</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Kill Points</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Gathered</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Helps</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Deaths</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, i) => (
                      <tr key={row.kingdom_id} className="border-b border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
                        <td className="px-4 py-3 text-[var(--text-muted)] font-medium">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-[var(--foreground)]">
                          <span
                            className="inline-block w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: KD_COLORS[kingdoms.indexOf(row.kingdom_id) % KD_COLORS.length] }}
                          />
                          KD {row.kingdom_id}
                        </td>
                        <td className="px-4 py-3 text-right text-indigo-400 font-semibold tabular-nums">{row.total_power.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-red-400 tabular-nums">{row.total_kill.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">{row.total_collect.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-amber-400 tabular-nums">{row.total_help.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)] tabular-nums">{row.total_dead.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-secondary)] tabular-nums">{row.member_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CHARTS VIEW ═══ */}
      {activeTab === 'charts' && (
        <div className="space-y-4">
          {/* Chart controls */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Kingdom multi-select */}
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-2">Kingdoms</div>
                <div className="flex gap-2">
                  {kingdoms.map((k, i) => (
                    <button
                      key={k}
                      onClick={() => toggleChartKingdom(k)}
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

              {/* Metric selector */}
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

              {/* Date range */}
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

          {/* Chart */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              {METRICS.find(m => m.key === chartMetric)?.label || 'Trend'} — Top 400
            </h2>

            {loadingAggregates ? (
              <div className="h-80 flex items-center justify-center text-[var(--text-muted)]">Loading...</div>
            ) : chartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-[var(--text-muted)]">No historical data yet</div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="dt"
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      tickFormatter={formatCompact}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--background-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--foreground)',
                      }}
                      formatter={(value?: number) => formatCompact(value ?? 0)}
                      labelFormatter={(label: string) => `Date: ${label}`}
                    />
                    <Legend />
                    {sortedChartKingdomIds.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={`KD ${k}`}
                        name={`KD ${k}`}
                        stroke={KD_COLORS[i % KD_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.length > 0 && (
              <div className="mt-4 text-xs text-[var(--text-muted)]">
                {chartData.length} dates &middot; {chartKingdomIds.length} kingdom{chartKingdomIds.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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

function HeaderCell({
  label, field, sortField, sortDir, onSort, align = 'left',
}: {
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
        {sortField === field ? (
          sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        ) : (
          <ChevronDown size={14} className="opacity-20" />
        )}
      </span>
    </th>
  );
}
