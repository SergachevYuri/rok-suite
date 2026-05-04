'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, UserPlus, Lock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { ADMIN_PASSWORD } from '@/lib/auth-passwords';
import { seedAssignment, type SeedAssignment } from '@/lib/kingdom/seed';
import { SeedBadge } from './SeedBadge';
import { formatCompact } from '@/lib/supabase/use-kingdom-seeds';

/** Cutoff for "young account" — gov_ids ≥ this are considered candidates
 *  for migration outreach. Tune via UI control if you ever need to. */
const DEFAULT_GOV_ID_FLOOR = 205_000_000;

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

interface KdStat {
  kingdom_id: number;
  power_400: number;
}

type SortField = 'kingdom_id' | 'player_id' | 'name' | 'power' | 'kp' | 'rank_in_kd' | 'seed';
type SortDir = 'asc' | 'desc';

export default function ReadyToMigrate() {
  // ─── Auth gate ───
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const submitPassword = () => {
    if (pwInput === ADMIN_PASSWORD) {
      setIsUnlocked(true);
      setPwInput('');
      setPwError('');
    } else {
      setPwError('Incorrect password');
      setPwInput('');
    }
  };

  // ─── Data ───
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [seedByKd, setSeedByKd] = useState<Map<number, SeedAssignment>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [govIdFloor, setGovIdFloor] = useState<number>(DEFAULT_GOV_ID_FLOOR);

  // ─── UI state ───
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (!isUnlocked) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = createClient();

        // 1. Find the latest scan_date in seeds_kd_stats.
        const { data: latestRow, error: e1 } = await sb
          .from('seeds_kd_stats')
          .select('scan_date')
          .order('scan_date', { ascending: false })
          .limit(1);
        if (e1) throw e1;
        const date = latestRow?.[0]?.scan_date as string | undefined;
        if (!date) {
          if (!cancelled) {
            setLatestDate(null);
            setPlayers([]);
            setSeedByKd(new Map());
          }
          return;
        }

        // 2. Pull all KD stats for that date so we can derive seeds A/B/C/D.
        const { data: stats, error: e2 } = await sb
          .from('seeds_kd_stats')
          .select('kingdom_id, power_400')
          .eq('scan_date', date)
          .order('power_400', { ascending: false });
        if (e2) throw e2;
        const kdStats = (stats ?? []) as KdStat[];
        const seedMap = new Map<number, SeedAssignment>();
        kdStats.forEach((s, i) => seedMap.set(s.kingdom_id, seedAssignment(i + 1)));

        // 3. Pull all players with player_id >= govIdFloor for that date.
        const rows = await fetchAllRows<PlayerRow>((range) =>
          sb
            .from('seeds_kd_players')
            .select('*')
            .eq('scan_date', date)
            .gte('player_id', govIdFloor)
            .order('power', { ascending: false })
            .range(range.from, range.to)
        );

        if (cancelled) return;
        setLatestDate(date);
        setSeedByKd(seedMap);
        setPlayers(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isUnlocked, govIdFloor]);

  const filteredAndSorted = useMemo(() => {
    let data = [...players];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(p =>
        p.name.toLowerCase().includes(q) ||
        String(p.player_id).includes(q) ||
        String(p.kingdom_id).includes(q)
      );
    }
    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else if (sortField === 'seed') {
        // A < B < C < D in display order; null at the bottom
        const order = { A: 0, B: 1, C: 2, D: 3 } as const;
        const av = seedByKd.get(a.kingdom_id);
        const bv = seedByKd.get(b.kingdom_id);
        const an = av ? order[av] : 99;
        const bn = bv ? order[bv] : 99;
        cmp = an - bn;
      } else cmp = (a[sortField] || 0) - (b[sortField] || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return data;
  }, [players, search, sortField, sortDir, seedByKd]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      // numeric fields default desc; text defaults asc
      setSortDir(field === 'name' || field === 'rank_in_kd' || field === 'seed' || field === 'kingdom_id' ? 'asc' : 'desc');
    }
  };

  // ─── Auth gate UI ───
  if (!isUnlocked) {
    return (
      <div className="min-h-screen p-4 lg:p-8">
        <div className="max-w-md">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Lock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Restricted</h3>
                <p className="text-xs text-[var(--text-muted)]">Admin password required</p>
              </div>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }}
                placeholder="Enter password"
                className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
                autoFocus
              />
              {pwError && <div className="text-xs text-red-400">{pwError}</div>}
              <button
                onClick={submitPassword}
                disabled={!pwInput}
                className="w-full px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white text-sm font-medium disabled:opacity-50"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <UserPlus size={26} className="text-amber-400" />
          Ready to migrate
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Players with gov id ≥ {govIdFloor.toLocaleString()} across all kingdoms in the latest scan ({latestDate ?? '—'}).
          Their KD&apos;s seed band is shown so you can prioritise outreach.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          gov_id ≥
          <input
            type="number"
            value={govIdFloor}
            onChange={(e) => setGovIdFloor(Math.max(0, Number(e.target.value) || 0))}
            className="w-32 px-2 py-1 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm font-mono focus:outline-none"
          />
        </label>

        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by name, gov id, or KD..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)]"
          />
        </div>

        <span className="text-sm text-[var(--text-muted)]">
          {filteredAndSorted.length.toLocaleString()} player{filteredAndSorted.length !== 1 ? 's' : ''}
          {search.trim() && ` (${players.length.toLocaleString()} total)`}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[var(--text-muted)]">Loading...</div>
        ) : !latestDate ? (
          <div className="p-12 text-center text-[var(--text-muted)]">No scans uploaded yet.</div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)]">No players match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
                  <HeaderCell label="KD"        field="kingdom_id" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <HeaderCell label="Seed"      field="seed"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <HeaderCell label="Player ID" field="player_id"  sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <HeaderCell label="Name"      field="name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <HeaderCell label="Power"     field="power"      sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <HeaderCell label="KP"        field="kp"         sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <HeaderCell label="Rank in KD" field="rank_in_kd" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map(p => (
                  <tr key={`${p.kingdom_id}-${p.player_id}`} className="border-b border-[var(--border)] hover:bg-[var(--background-secondary)] transition-colors">
                    <td className="px-3 py-2.5 font-medium text-[var(--foreground)] tabular-nums">KD {p.kingdom_id}</td>
                    <td className="px-3 py-2.5"><SeedBadge seed={seedByKd.get(p.kingdom_id) ?? null} /></td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)] text-xs tabular-nums">{p.player_id}</td>
                    <td className="px-3 py-2.5 text-[var(--foreground)]">{p.name}</td>
                    <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(p.power)}</td>
                    <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(p.kp)}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{p.rank_in_kd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
