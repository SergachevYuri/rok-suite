'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, BarChart3, Table, TrendingUp, GitCompareArrows, Upload as UploadIcon } from 'lucide-react';
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

type SortField = 'rank_in_kd' | 'name' | 'power' | 'kp' | 'cityhall';
type SortDir = 'asc' | 'desc';

const METRICS = [
  { key: 'power_400', label: 'Top 400 Power', color: '#818cf8' },
  { key: 'total_kp',  label: 'Total KP',      color: '#f87171' },
] as const;

const KD_COLORS = ['#818cf8', '#f87171', '#34d399', '#fbbf24', '#fb923c', '#a78bfa', '#22d3ee', '#f472b6', '#a3e635', '#fb7185'];

type TabType = 'table' | 'charts' | 'comparison' | 'upload';
const VALID_TABS: TabType[] = ['table', 'charts', 'comparison', 'upload'];

export default function KingdomStats() {
  const searchParams = useSearchParams();
  const router = useRouter();

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
  const [sortField, setSortField] = useState<SortField>('rank_in_kd');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Chart state
  const [chartKingdoms, setChartKingdoms] = useState<Set<number>>(new Set());
  const [chartMetric, setChartMetric] = useState<'power_400' | 'total_kp'>('power_400');
  const [chartDateFrom, setChartDateFrom] = useState<string>('');
  const [chartDateTo, setChartDateTo] = useState<string>('');

  // Comparison state
  const [comparisonDate, setComparisonDate] = useState<string>('');
  const [compSortField, setCompSortField] = useState<'power_400' | 'total_kp' | 'power_rank' | 'kp_rank' | 'kingdom_id'>('power_400');
  const [compSortDir, setCompSortDir] = useState<SortDir>('desc');

  // Refresh trigger to re-fetch after an upload
  const [refreshKey, setRefreshKey] = useState(0);

  // Data
  const { kingdoms, loading: loadingKingdoms } = useAvailableSeedKingdoms();
  const { dates, loading: loadingDates } = useSeedDates(selectedKingdom);
  const { dates: allDates } = useSeedDates(null);
  const { players, loading: loadingPlayers } = useSeedPlayers(selectedKingdom, selectedDate);

  const chartKingdomIds = useMemo(() => Array.from(chartKingdoms), [chartKingdoms]);
  const { stats: chartStats, loading: loadingChart } = useSeedKdStats(
    chartKingdomIds,
    chartDateFrom || null,
    chartDateTo || null,
  );

  const { stats: compStats, loading: loadingComparison } = useSeedKdStats(
    kingdoms,
    comparisonDate || null,
    comparisonDate || null,
  );

  // Auto-select first kingdom & default chart selection
  React.useEffect(() => {
    if (kingdoms.length > 0 && !selectedKingdom) {
      setSelectedKingdom(kingdoms[0]);
      setChartKingdoms(new Set(kingdoms));
    }
  }, [kingdoms, selectedKingdom]);

  React.useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  React.useEffect(() => {
    if (allDates.length > 0 && !comparisonDate) setComparisonDate(allDates[0]);
  }, [allDates, comparisonDate]);

  React.useEffect(() => { setPage(0); }, [search, selectedKingdom, selectedDate, sortField, sortDir]);

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

  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paged = filtered.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

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

  // Comparison: one row per KD for selected date, sortable
  const comparisonRows = useMemo(() => {
    if (compStats.length === 0) return [];
    const forDate = comparisonDate ? compStats.filter(s => s.scan_date === comparisonDate) : compStats;
    const byKd = new Map<number, SeedKdStat>();
    for (const s of forDate) if (!byKd.has(s.kingdom_id)) byKd.set(s.kingdom_id, s);
    const rows = Array.from(byKd.values());
    rows.sort((a, b) => {
      const av = a[compSortField] || 0;
      const bv = b[compSortField] || 0;
      if (av < bv) return compSortDir === 'asc' ? -1 : 1;
      if (av > bv) return compSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [compStats, comparisonDate, compSortField, compSortDir]);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <BarChart3 size={28} className="text-green-500" />
          Kingdom Stats
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Seeds scan stats — uploaded from Excel</p>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-lg border border-[var(--border)] overflow-hidden mb-6 w-fit">
        <TabButton active={activeTab === 'table'}      onClick={() => setActiveTab('table')}      icon={<Table size={16} />}            label="Table" />
        <TabButton active={activeTab === 'charts'}     onClick={() => setActiveTab('charts')}     icon={<TrendingUp size={16} />}       label="Charts" />
        <TabButton active={activeTab === 'comparison'} onClick={() => setActiveTab('comparison')} icon={<GitCompareArrows size={16} />} label="Comparison" />
        <TabButton active={activeTab === 'upload'}     onClick={() => setActiveTab('upload')}     icon={<UploadIcon size={16} />}       label="Upload" />
      </div>

      {/* ═══ TABLE ═══ */}
      {activeTab === 'table' && (
        <>
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
                      {paged.map(p => (
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

                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span>{filtered.length} player{filtered.length !== 1 ? 's' : ''}</span>
                    <select
                      value={rowsPerPage}
                      onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                      className="px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs"
                    >
                      {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} / page</option>)}
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

      {/* ═══ COMPARISON ═══ */}
      {activeTab === 'comparison' && (
        <div className="space-y-4">
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
                      <CompHeader label="Kingdom"    field="kingdom_id" sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} />
                      <CompHeader label="Power 400"  field="power_400"  sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                      <CompHeader label="Total KP"   field="total_kp"   sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                      <CompHeader label="Power Rank" field="power_rank" sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
                      <CompHeader label="KP Rank"    field="kp_rank"    sortField={compSortField} sortDir={compSortDir} onSort={handleCompSort} align="right" />
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
                        <td className="px-4 py-3 text-right text-indigo-400 font-semibold tabular-nums">{(row.power_400 || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-red-400 tabular-nums">{(row.total_kp || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-secondary)] tabular-nums">{row.power_rank || '–'}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-secondary)] tabular-nums">{row.kp_rank || '–'}</td>
                      </tr>
                    ))}
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
                <div className="text-xs text-[var(--text-muted)] mb-2">Kingdoms</div>
                <div className="flex gap-2 flex-wrap max-w-2xl">
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
              <div className="h-80 flex items-center justify-center text-[var(--text-muted)]">Loading...</div>
            ) : chartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-[var(--text-muted)]">No historical data yet</div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="scan_date"
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
                    {sortedChartKingdomIds.map((k) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={`KD ${k}`}
                        name={`KD ${k}`}
                        stroke={KD_COLORS[kingdoms.indexOf(k) % KD_COLORS.length]}
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

      {/* ═══ UPLOAD ═══ */}
      {activeTab === 'upload' && (
        <SeedsUpload onUploaded={handleUploaded} />
      )}
    </div>
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
