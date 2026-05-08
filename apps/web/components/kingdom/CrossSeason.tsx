'use client';

// Cross-season scan page. Same Excel format as the regular seeds upload but
// writes to dedicated tables (cross_season_kd_stats / cross_season_kd_players)
// so the cross-season player pool stays separate from the per-KvK scans.
//
// Tabs:
//   - Players  → virtualized table with all uploaded players, KD filter, search
//   - Upload   → admin-only Excel uploader

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Search, Table as TableIcon, Upload as UploadIcon, Users } from 'lucide-react';
import SeedsUpload from './SeedsUpload';
import { AuthGate } from '@/components/AuthGate';
import { meetsRole, useAuthRole } from '@/lib/auth-role';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { formatCompact } from '@/lib/supabase/use-kingdom-seeds';

const TARGET = {
  stats: 'cross_season_kd_stats',
  players: 'cross_season_kd_players',
};

interface PlayerRow {
  scan_date: string;
  kingdom_id: number;
  player_id: number;
  name: string;
  power: number;
  kp: number;
  cityhall: number;
  rank_in_kd: number;
}

type Tab = 'players' | 'upload';
type SortField = 'kingdom_id' | 'player_id' | 'name' | 'power' | 'kp' | 'rank_in_kd';
type SortDir = 'asc' | 'desc';

export default function CrossSeason() {
  return (
    <AuthGate require={['admin', 'officer']}>
      <CrossSeasonInner />
    </AuthGate>
  );
}

function CrossSeasonInner() {
  const { role } = useAuthRole();
  const isAdmin = meetsRole(role, 'admin');

  const [tab, setTab] = useState<Tab>('players');

  // ─── Data ───
  const [scanDates, setScanDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [kingdoms, setKingdoms] = useState<number[]>([]);
  const [selectedKd, setSelectedKd] = useState<number | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── UI state ───
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Refresh trigger after an upload
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. Pull the list of scan_dates available so the user can pick a snapshot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data, error: e } = await sb
          .from(TARGET.stats)
          .select('scan_date')
          .order('scan_date', { ascending: false })
          .limit(1000);
        if (e) throw e;
        if (cancelled) return;
        const dates = Array.from(new Set((data ?? []).map((r) => r.scan_date as string)));
        setScanDates(dates);
        if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load scan dates');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // 2. Pull players for the selected scan_date.
  useEffect(() => {
    if (!selectedDate) {
      setPlayers([]);
      setKingdoms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = createClient();
        const data = await fetchAllRows<PlayerRow>((range) =>
          sb
            .from(TARGET.players)
            .select('*')
            .eq('scan_date', selectedDate)
            .order('power', { ascending: false })
            .range(range.from, range.to)
        );
        if (cancelled) return;
        setPlayers(data);
        setKingdoms(Array.from(new Set(data.map((p) => p.kingdom_id))).sort((a, b) => a - b));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load players');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, refreshKey]);

  const handleUploaded = () => {
    setRefreshKey((k) => k + 1);
    setTab('players');
  };

  const filteredAndSorted = useMemo(() => {
    let data = players;
    if (selectedKd != null) data = data.filter((p) => p.kingdom_id === selectedKd);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.player_id).includes(q) ||
        String(p.kingdom_id).includes(q),
      );
    }
    const sign = sortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else cmp = (a[sortField] || 0) - (b[sortField] || 0);
      return sign * cmp;
    });
  }, [players, selectedKd, search, sortField, sortDir]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(f);
      setSortDir(f === 'name' || f === 'rank_in_kd' || f === 'kingdom_id' ? 'asc' : 'desc');
    }
  };

  // ─── Virtualization ───
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 41,
    overscan: 12,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const padTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const padBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="mb-6">
        <Link
          href="/kingdom/kingdom-stats"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] mb-2"
        >
          <ArrowLeft size={12} /> Back to Kingdom Stats
        </Link>
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Users size={26} className="text-violet-400" />
          Cross-season scans
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Same Excel format as the regular scans, but stored in a separate table dedicated to cross-season migration tracking.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg border border-[var(--border)] overflow-hidden mb-6 w-fit">
        <button
          onClick={() => setTab('players')}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${tab === 'players' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
        >
          <TableIcon size={14} /> Players
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('upload')}
            className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${tab === 'upload' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--background-card)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
          >
            <UploadIcon size={14} /> Upload
          </button>
        )}
      </div>

      {tab === 'upload' && isAdmin && (
        <SeedsUpload
          target={TARGET}
          title="Cross-season Excel upload"
          onUploaded={handleUploaded}
        />
      )}

      {tab === 'players' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Scan
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={scanDates.length === 0}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm disabled:opacity-60"
              >
                {scanDates.length === 0 && <option value="">No scans yet</option>}
                {scanDates.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              KD
              <select
                value={selectedKd ?? ''}
                onChange={(e) => setSelectedKd(e.target.value ? Number(e.target.value) : null)}
                disabled={kingdoms.length === 0}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm disabled:opacity-60"
              >
                <option value="">All KDs</option>
                {kingdoms.map((k) => <option key={k} value={k}>KD {k}</option>)}
              </select>
            </label>

            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / gov id / KD…"
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#4318ff]"
              />
            </div>

            <span className="text-sm text-[var(--text-muted)] tabular-nums">
              {filteredAndSorted.length.toLocaleString()} player{filteredAndSorted.length !== 1 ? 's' : ''}
              {search.trim() && ` (${players.length.toLocaleString()} total)`}
            </span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-4 text-sm text-red-300">{error}</div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-[var(--text-muted)]">Loading...</div>
            ) : scanDates.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-muted)]">
                No cross-season scans uploaded yet.{isAdmin ? ' Switch to Upload to add the first one.' : ''}
              </div>
            ) : filteredAndSorted.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-muted)]">No players match the current filters.</div>
            ) : (
              <div ref={scrollRef} className="overflow-auto max-h-[70vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--background-secondary)]">
                    <tr className="border-b border-[var(--border)]">
                      <HeaderCell label="KD"        field="kingdom_id" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      <HeaderCell label="Player ID" field="player_id"  sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      <HeaderCell label="Name"      field="name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      <HeaderCell label="Power"     field="power"      sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                      <HeaderCell label="KP"        field="kp"         sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                      <HeaderCell label="Rank in KD" field="rank_in_kd" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {padTop > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: padTop, padding: 0, border: 0 }} /></tr>}
                    {virtualItems.map((vrow) => {
                      const p = filteredAndSorted[vrow.index];
                      return <PlayerRowMemo key={`${p.kingdom_id}-${p.player_id}`} row={p} />;
                    })}
                    {padBottom > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const PlayerRowMemo = memo(function PlayerRowMemo({ row: p }: { row: PlayerRow }) {
  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
      <td className="px-3 py-2.5 font-medium text-[var(--foreground)] tabular-nums">KD {p.kingdom_id}</td>
      <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs tabular-nums">{p.player_id}</td>
      <td className="px-3 py-2.5 text-[var(--foreground)]">{p.name}</td>
      <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(p.power)}</td>
      <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(p.kp)}</td>
      <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{p.rank_in_kd}</td>
    </tr>
  );
});

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
      onClick={() => onSort(field)}
      className={`px-3 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
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
