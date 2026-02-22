'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, BarChart3, Table, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  useAvailableKingdoms,
  useKingdomDates,
  useKingdomMembers,
  useKingdomAggregates,
  formatCompact,
  type KingdomMember,
} from '@/lib/supabase/use-kingdom-members';

type SortField = 'power' | 'kill' | 'collect' | 'help' | 'dead' | 't4' | 't5' | 'name' | 'max_power';
type SortDir = 'asc' | 'desc';

const CHART_LINES = [
  { key: 'total_power', label: 'Total Power', color: '#818cf8' },
  { key: 'total_kill', label: 'Kill Points', color: '#f87171' },
  { key: 'total_collect', label: 'Resources', color: '#34d399' },
  { key: 'total_help', label: 'Helps', color: '#fbbf24' },
] as const;

export default function KingdomStats() {
  // State
  const [selectedKingdom, setSelectedKingdom] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [visibleLines, setVisibleLines] = useState<Set<string>>(new Set(CHART_LINES.map(l => l.key)));
  const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table');

  // Data
  const { kingdoms, loading: loadingKingdoms } = useAvailableKingdoms();
  const { dates, loading: loadingDates } = useKingdomDates(selectedKingdom);
  const { members, loading: loadingMembers } = useKingdomMembers(selectedKingdom, selectedDate);
  const { aggregates, loading: loadingAggregates } = useKingdomAggregates(selectedKingdom);

  // Auto-select first kingdom and date
  React.useEffect(() => {
    if (kingdoms.length > 0 && !selectedKingdom) setSelectedKingdom(kingdoms[0]);
  }, [kingdoms, selectedKingdom]);

  React.useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  // Reset page on filter change
  React.useEffect(() => { setPage(0); }, [search, selectedKingdom, selectedDate, sortField, sortDir]);

  // Sort & filter
  const filtered = useMemo(() => {
    let data = [...members];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(m => m.name.toLowerCase().includes(q));
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
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={14} className="opacity-20" />;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const toggleLine = (key: string) => {
    setVisibleLines(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isLoading = loadingKingdoms || loadingDates || loadingMembers;

  return (
    <div className="min-h-screen p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <BarChart3 size={28} className="text-green-500" />
          Kingdom Stats
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Daily member statistics from Lilith Game Tools</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Kingdom selector */}
        <select
          value={selectedKingdom || ''}
          onChange={e => { setSelectedKingdom(Number(e.target.value)); setSelectedDate(null); }}
          className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
        >
          {loadingKingdoms && <option>Loading...</option>}
          {kingdoms.map(k => <option key={k} value={k}>KD {k}</option>)}
        </select>

        {/* Date selector */}
        <select
          value={selectedDate || ''}
          onChange={e => setSelectedDate(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
        >
          {loadingDates && <option>Loading...</option>}
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        {/* Search */}
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

        {/* Tab toggle */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden ml-auto">
          <button
            onClick={() => setActiveTab('table')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeTab === 'table' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
          >
            <Table size={16} /> Table
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeTab === 'charts' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
          >
            <TrendingUp size={16} /> Charts
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && members.length > 0 && activeTab === 'table' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Members" value={members.length.toLocaleString()} color="text-sky-400" />
          <SummaryCard label="Total Power" value={formatCompact(members.reduce((s, m) => s + m.power, 0))} color="text-indigo-400" />
          <SummaryCard label="Total Kill Points" value={formatCompact(members.reduce((s, m) => s + m.kill, 0))} color="text-red-400" />
          <SummaryCard label="Total Gathered" value={formatCompact(members.reduce((s, m) => s + m.collect, 0))} color="text-emerald-400" />
        </div>
      )}

      {/* Table view */}
      {activeTab === 'table' && (
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

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <span>{filtered.length} members</span>
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
      )}

      {/* Charts view */}
      {activeTab === 'charts' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Historical Trends</h2>
            <div className="flex gap-2">
              {CHART_LINES.map(line => (
                <button
                  key={line.key}
                  onClick={() => toggleLine(line.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    visibleLines.has(line.key)
                      ? 'border-transparent text-white'
                      : 'border-[var(--border)] text-[var(--text-muted)] bg-transparent'
                  }`}
                  style={visibleLines.has(line.key) ? { backgroundColor: line.color } : {}}
                >
                  {line.label}
                </button>
              ))}
            </div>
          </div>

          {loadingAggregates ? (
            <div className="h-80 flex items-center justify-center text-[var(--text-muted)]">Loading...</div>
          ) : aggregates.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-[var(--text-muted)]">No historical data yet</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aggregates}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="dt"
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    tickFormatter={d => d.slice(5)}
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
                    labelFormatter={label => `Date: ${label}`}
                  />
                  <Legend />
                  {CHART_LINES.filter(l => visibleLines.has(l.key)).map(line => (
                    <Line
                      key={line.key}
                      type="monotone"
                      dataKey={line.key}
                      name={line.label}
                      stroke={line.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Aggregate stats below chart */}
          {aggregates.length > 0 && (
            <div className="mt-4 text-xs text-[var(--text-muted)]">
              {aggregates.length} data points &middot; {aggregates[0]?.dt} to {aggregates[aggregates.length - 1]?.dt}
            </div>
          )}
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
