'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, UserPlus, Lock, ArrowLeft, Check, Plus, MessageSquare, Copy } from 'lucide-react';
import Link from 'next/link';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { ADMIN_PASSWORD, OFFICER_PASSWORD } from '@/lib/auth-passwords';
import { seedAssignment, type SeedAssignment } from '@/lib/kingdom/seed';
import { SeedBadge } from './SeedBadge';
import { formatCompact } from '@/lib/supabase/use-kingdom-seeds';
import { addOutreachEntry, listOutreachIds } from '@/lib/supabase/use-migration-outreach';

/** Cutoff for "young account" — gov_ids ≥ this are considered candidates
 *  for migration outreach. Tune via UI control if you ever need to. */
const DEFAULT_GOV_ID_FLOOR = 205_000_000;

/** Outreach mail template — ready to copy & paste in-game. */
const SAMPLE_MESSAGE = `Hello how are u? i wish all good. Im from KD 3923 and im looking for a couple of good whales to join us and fight with my marches together for kvk3, would u be interested? We won (with some luck) both kvk1 and kvk2^^ We want top seed C`;

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
  total_kp: number;
}

interface KdSummary {
  kingdom_id: number;
  power_400: number;
  total_kp: number;
  seed: SeedAssignment;
  candidates: number;
  rank: number;
}

type SortField = 'kingdom_id' | 'player_id' | 'name' | 'power' | 'kp' | 'rank_in_kd' | 'seed';
type SortDir = 'asc' | 'desc';

export default function ReadyToMigrate() {
  // ─── Auth gate ───
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const submitPassword = () => {
    if (pwInput === ADMIN_PASSWORD || pwInput === OFFICER_PASSWORD) {
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
  const [candidatePlayers, setCandidatePlayers] = useState<PlayerRow[]>([]);
  const [kdPlayers, setKdPlayers] = useState<PlayerRow[]>([]);
  const [seedByKd, setSeedByKd] = useState<Map<number, SeedAssignment>>(new Map());
  const [statsByKd, setStatsByKd] = useState<Map<number, KdStat>>(new Map());
  const [rankByKd, setRankByKd] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingKd, setLoadingKd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [govIdFloor, setGovIdFloor] = useState<number>(DEFAULT_GOV_ID_FLOOR);

  // ─── Outreach state ───
  const [outreachIds, setOutreachIds] = useState<Set<number>>(new Set());
  const [fillingId, setFillingId] = useState<number | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_MESSAGE);
      setMessageCopied(true);
      window.setTimeout(() => setMessageCopied(false), 1500);
    } catch {
      /* clipboard not available — silently ignore */
    }
  };

  // ─── UI state ───
  const [selectedKd, setSelectedKd] = useState<number | null>(null);
  /** Minimum KP in millions — filters out deadweight accounts. */
  const [kpFloorM, setKpFloorM] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const kpFloor = kpFloorM * 1_000_000;

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
            setCandidatePlayers([]);
            setSeedByKd(new Map());
            setStatsByKd(new Map());
            setRankByKd(new Map());
          }
          return;
        }

        // 2. Pull all KD stats for that date so we can derive seeds A/B/C/D
        //    and feed the summary table.
        const { data: stats, error: e2 } = await sb
          .from('seeds_kd_stats')
          .select('kingdom_id, power_400, total_kp')
          .eq('scan_date', date)
          .order('power_400', { ascending: false });
        if (e2) throw e2;
        const kdStats = (stats ?? []) as KdStat[];
        const seedMap = new Map<number, SeedAssignment>();
        const statsMap = new Map<number, KdStat>();
        const rankMap = new Map<number, number>();
        kdStats.forEach((s, i) => {
          seedMap.set(s.kingdom_id, seedAssignment(i + 1));
          statsMap.set(s.kingdom_id, s);
          rankMap.set(s.kingdom_id, i + 1);
        });

        // 3. Pull all players with player_id >= govIdFloor for that date.
        //    Used both for the candidates count per KD (summary) and as the
        //    main list when "All KDs" is selected.
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
        setStatsByKd(statsMap);
        setRankByKd(rankMap);
        setCandidatePlayers(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isUnlocked, govIdFloor]);

  // Load the set of player_ids already in the outreach table so the Fill
  // button can render as "Added" instead of "Fill" without a duplicate insert.
  useEffect(() => {
    if (!isUnlocked) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = await listOutreachIds();
        if (!cancelled) setOutreachIds(ids);
      } catch (e) {
        console.warn('Failed to load outreach ids', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isUnlocked]);

  const handleFill = async (p: PlayerRow) => {
    if (outreachIds.has(p.player_id)) return;
    setFillingId(p.player_id);
    try {
      const { added } = await addOutreachEntry({
        player_id: p.player_id,
        kingdom_id: p.kingdom_id,
        name: p.name,
        power: p.power,
        kp: p.kp,
        cityhall: p.cityhall,
        rank_in_kd: p.rank_in_kd,
        source_scan_date: p.scan_date,
      });
      if (added) {
        setOutreachIds((s) => {
          const next = new Set(s);
          next.add(p.player_id);
          return next;
        });
      }
    } catch (e) {
      alert(`Failed to add: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFillingId(null);
    }
  };

  // When the user picks a specific KD, load every player of that KD for the
  // latest scan (no floor filter) — the floor still drives the highlight.
  useEffect(() => {
    if (!isUnlocked || !latestDate || !selectedKd) {
      setKdPlayers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingKd(true);
      try {
        const sb = createClient();
        const rows = await fetchAllRows<PlayerRow>((range) =>
          sb
            .from('seeds_kd_players')
            .select('*')
            .eq('scan_date', latestDate)
            .eq('kingdom_id', selectedKd)
            .order('rank_in_kd', { ascending: true })
            .range(range.from, range.to)
        );
        if (!cancelled) setKdPlayers(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load KD players');
      } finally {
        if (!cancelled) setLoadingKd(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isUnlocked, latestDate, selectedKd]);

  // Source rows depend on the dropdown:
  //   - All KDs  → only candidates (gov_id ≥ floor) across every kingdom
  //   - One KD   → every player in that kingdom (highlight applied for ≥ floor)
  const sourceRows = selectedKd ? kdPlayers : candidatePlayers;
  const totalRowsCount = sourceRows.length;

  const filteredAndSorted = useMemo(() => {
    let data = sourceRows.filter((p) => p.kp >= kpFloor);
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
  }, [sourceRows, search, sortField, sortDir, seedByKd, kpFloor]);

  // KD summary table (top of page) — one row per KD with seed band, power,
  // total KP, rank, and how many candidates that KD has at the current floor.
  const kdSummary = useMemo<KdSummary[]>(() => {
    const candidatesByKd = new Map<number, number>();
    for (const p of candidatePlayers) {
      if (p.kp < kpFloor) continue;
      candidatesByKd.set(p.kingdom_id, (candidatesByKd.get(p.kingdom_id) ?? 0) + 1);
    }
    const rows: KdSummary[] = [];
    for (const [kingdom_id, stats] of statsByKd) {
      rows.push({
        kingdom_id,
        power_400: stats.power_400,
        total_kp: stats.total_kp,
        seed: seedByKd.get(kingdom_id) ?? null,
        rank: rankByKd.get(kingdom_id) ?? 0,
        candidates: candidatesByKd.get(kingdom_id) ?? 0,
      });
    }
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }, [statsByKd, seedByKd, rankByKd, candidatePlayers, kpFloor]);

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
                <p className="text-xs text-[var(--text-muted)]">Officer or Admin password required</p>
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/kingdom/kingdom-stats"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] mb-2"
          >
            <ArrowLeft size={12} /> Back to Kingdom Stats
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <UserPlus size={26} className="text-amber-400" />
            Possible candidates
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Latest scan: {latestDate ?? '—'}. Highlighted rows = candidates with gov_id ≥ {govIdFloor.toLocaleString()}.
          </p>
        </div>
        <Link
          href="/kingdom/migration-outreach"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-colors flex-shrink-0"
          title="Track contact attempts and responses for filled players"
        >
          Outreach list ({outreachIds.size}) →
        </Link>
      </div>

      {/* ─── Sample outreach message ─── */}
      <details className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 overflow-hidden">
        <summary className="px-4 py-2.5 text-sm font-medium text-cyan-200 cursor-pointer hover:bg-cyan-500/10 transition-colors flex items-center gap-2">
          <MessageSquare size={14} className="text-cyan-300" />
          Sample outreach message
          <span className="text-xs text-[var(--text-muted)] font-normal">(click to expand)</span>
        </summary>
        <div className="px-4 py-3 border-t border-cyan-500/20 space-y-2">
          <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed">{SAMPLE_MESSAGE}</pre>
          <div className="flex justify-end">
            <button
              onClick={copyMessage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs font-medium hover:bg-cyan-500/25 transition-colors"
            >
              {messageCopied ? (<><Check size={12} /> Copied!</>) : (<><Copy size={12} /> Copy to clipboard</>)}
            </button>
          </div>
        </div>
      </details>

      {/* ─── Filters (sticky so they stay visible while scrolling) ─── */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-4 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            KD
            <select
              value={selectedKd ?? ''}
              onChange={(e) => setSelectedKd(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
            >
              <option value="">All KDs (candidates only)</option>
              {kdSummary.map((s) => (
                <option key={s.kingdom_id} value={s.kingdom_id}>KD {s.kingdom_id}{s.candidates > 0 ? ` · ${s.candidates} cand.` : ''}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            gov_id ≥
            <input
              type="number"
              value={govIdFloor}
              onChange={(e) => setGovIdFloor(Math.max(0, Number(e.target.value) || 0))}
              className="w-32 px-2 py-1 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm font-mono focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            KP ≥
            <input
              type="text"
              inputMode="decimal"
              value={kpFloorM}
              onChange={(e) => {
                // Allow only numeric input (digits + optional dot for decimals).
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                const n = raw === '' ? 0 : Number(raw);
                if (!Number.isNaN(n)) setKpFloorM(Math.max(0, n));
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
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)]"
            />
          </div>

          <span className="text-sm text-[var(--text-muted)]">
            {filteredAndSorted.length.toLocaleString()} player{filteredAndSorted.length !== 1 ? 's' : ''}
            {search.trim() && ` (${totalRowsCount.toLocaleString()} total)`}
          </span>
        </div>
      </div>

      {/* ─── KD summary table ─── */}
      <details className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden" open>
        <summary className="px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] cursor-pointer hover:bg-[var(--background-secondary)] transition-colors flex items-center justify-between">
          <span>Kingdom summary <span className="text-[var(--text-muted)] font-normal">({kdSummary.length} KDs)</span></span>
          <span className="text-xs text-[var(--text-muted)]">
            {candidatePlayers.length.toLocaleString()} total candidates
          </span>
        </summary>
        {kdSummary.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--text-muted)]">No KDs in latest scan.</div>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--background-secondary)]">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Seed</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Kingdom</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Power 400</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total KP</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Candidates</th>
                </tr>
              </thead>
              <tbody>
                {kdSummary.map((row) => {
                  const isSelected = selectedKd === row.kingdom_id;
                  return (
                    <tr
                      key={row.kingdom_id}
                      onClick={() => setSelectedKd(isSelected ? null : row.kingdom_id)}
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-amber-500/10 hover:bg-amber-500/15 ring-1 ring-inset ring-amber-500/30'
                          : 'hover:bg-[var(--background-secondary)]'
                      }`}
                    >
                      <td className="px-3 py-2 text-[var(--text-muted)] font-medium tabular-nums">{row.rank}</td>
                      <td className="px-3 py-2 text-center"><SeedBadge seed={row.seed} /></td>
                      <td className="px-3 py-2 font-semibold text-[var(--foreground)]">KD {row.kingdom_id}</td>
                      <td className="px-3 py-2 text-right text-indigo-400 tabular-nums">{(row.power_400 || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-red-400 tabular-nums">{(row.total_kp || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.candidates > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {row.candidates}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
              Click a row to filter the player list below to that KD.
            </div>
          </div>
        )}
      </details>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
        {(loading || (selectedKd && loadingKd)) ? (
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
                  <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map(p => {
                  const isCandidate = p.player_id >= govIdFloor;
                  const inOutreach = outreachIds.has(p.player_id);
                  const isFilling = fillingId === p.player_id;
                  return (
                    <tr
                      key={`${p.kingdom_id}-${p.player_id}`}
                      className={`border-b border-[var(--border)] transition-colors ${
                        isCandidate
                          ? 'bg-amber-500/10 hover:bg-amber-500/15'
                          : 'hover:bg-[var(--background-secondary)]'
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium text-[var(--foreground)] tabular-nums">KD {p.kingdom_id}</td>
                      <td className="px-3 py-2.5"><SeedBadge seed={seedByKd.get(p.kingdom_id) ?? null} /></td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums ${isCandidate ? 'text-amber-300 font-medium' : 'text-[var(--text-muted)]'}`}>{p.player_id}</td>
                      <td className="px-3 py-2.5 text-[var(--foreground)]">{p.name}</td>
                      <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(p.power)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(p.kp)}</td>
                      <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{p.rank_in_kd}</td>
                      <td className="px-3 py-2.5 text-right">
                        {inOutreach ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium">
                            <Check size={12} /> Added
                          </span>
                        ) : (
                          <button
                            onClick={() => handleFill(p)}
                            disabled={isFilling}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors text-[11px] font-medium disabled:opacity-50"
                            title="Add this player to the migration outreach list"
                          >
                            {isFilling ? '…' : (<><Plus size={12} /> Fill</>)}
                          </button>
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
