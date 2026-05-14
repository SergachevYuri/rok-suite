'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, ChevronUp, ChevronDown, UserPlus, ArrowLeft, Check, Plus, MessageSquare, Copy, X, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { meetsRole, useAuthRole } from '@/lib/auth-role';
import { seedAssignment, type SeedAssignment } from '@/lib/kingdom/seed';
import { SeedBadge } from './SeedBadge';
import { formatCompact } from '@/lib/supabase/use-kingdom-seeds';
import { addOutreachEntry, listOutreachIds, removeFromAllOutreach } from '@/lib/supabase/use-migration-outreach';
import { fetchMigratedPlayerIds } from '@/lib/kingdom/migrations';
import { OUTREACH_SAMPLE_MESSAGE } from '@/lib/kingdom/outreach-template';
import { SEASONS, useSeason, type Season } from '@/lib/kingdom/season-config';
import { addExclusion, addExclusionsBulk, listExclusions, listExclusionIds, removeExclusion, type CandidateExclusion } from '@/lib/supabase/use-candidate-exclusions';

/** Cutoff for "young account" — gov_ids ≥ this are considered candidates
 *  for migration outreach. Tune via UI control if you ever need to. */
const DEFAULT_GOV_ID_FLOOR = 205_000_000;

/** Best-effort human-readable string for whatever Supabase / fetch threw.
 *  PostgrestError comes back as a plain object so `String(e)` would print
 *  "[object Object]" — we surface its message/code/details instead. */
function explainError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const obj = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts: string[] = [];
    if (typeof obj.message === 'string' && obj.message) parts.push(obj.message);
    if (typeof obj.code === 'string' && obj.code) parts.push(`(code ${obj.code})`);
    if (typeof obj.details === 'string' && obj.details) parts.push(obj.details);
    if (typeof obj.hint === 'string' && obj.hint) parts.push(`Hint: ${obj.hint}`);
    if (parts.length > 0) return parts.join(' — ');
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}

// Outreach mail template lives in lib/kingdom/outreach-template.ts so the
// outreach tracking page can show the same text.
const SAMPLE_MESSAGE = OUTREACH_SAMPLE_MESSAGE;

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
  return <ReadyToMigrateInner />;
}

function ReadyToMigrateInner() {
  // Possible candidates is a public read view — anyone can browse, but the
  // Fill / Exclude / Restore actions are gated to admin or officer below.
  const { role } = useAuthRole();
  const canEdit = meetsRole(role, ['admin', 'officer']);

  // ─── Season switch ───
  const { season, config, setSeason } = useSeason();
  // The cross-season "from" baseline is unknown until the data loads (it's
  // the earliest cross-season scan_date). For KvK it's the static MIG_FROM_DATE.
  const [crossSeasonFromDate, setCrossSeasonFromDate] = useState<string | null>(null);
  const fromDate = config.fromDate ?? crossSeasonFromDate;

  // ─── Data ───
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [candidatePlayers, setCandidatePlayers] = useState<PlayerRow[]>([]);
  const [seedByKd, setSeedByKd] = useState<Map<number, SeedAssignment>>(new Map());
  const [statsByKd, setStatsByKd] = useState<Map<number, KdStat>>(new Map());
  const [rankByKd, setRankByKd] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [govIdFloor, setGovIdFloor] = useState<number>(DEFAULT_GOV_ID_FLOOR);

  // ─── Outreach state ───
  const [outreachIds, setOutreachIds] = useState<Set<number>>(new Set());
  const [fillingId, setFillingId] = useState<number | null>(null);

  // Players already detected as migrated/joined in the Migrations tab — they
  // can't migrate again from where they are now, so we hide them here.
  const [migratedIds, setMigratedIds] = useState<Set<number>>(new Set());

  // Manual "do not contact" list — separate per season (KvK vs cross). When an
  // officer clicks Exclude on a row we drop the player_id into both the local
  // set (instant feedback) and candidate_exclusions in Supabase (persistent).
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [excludingId, setExcludingId] = useState<number | null>(null);
  const [showExcludedPanel, setShowExcludedPanel] = useState(false);
  const [excludedList, setExcludedList] = useState<CandidateExclusion[]>([]);
  const [excludedListLoading, setExcludedListLoading] = useState(false);

  // ─── Bulk selection ───
  /** player_ids the user has checked for a bulk action (exclude). Cleared
   *  after a successful bulk operation or a season switch. */
  const [bulkSelection, setBulkSelection] = useState<Set<number>>(new Set());
  const [bulkExcluding, setBulkExcluding] = useState(false);

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
  /** Multi-select KD filter. `null` means "haven't initialised yet — treat
   *  as all selected"; once we hydrate it from the latest scan it becomes a
   *  Set the user toggles. Empty Set = nothing visible. */
  const [selectedKds, setSelectedKds] = useState<Set<number> | null>(null);
  /** Minimum KP in millions — filters out deadweight accounts. */
  const [kpFloorM, setKpFloorM] = useState<number>(200);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const kpFloor = kpFloorM * 1_000_000;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = createClient();

        // 1. Find the latest scan_date in the active season's stats table.
        const { data: latestRow, error: e1 } = await sb
          .from(config.tables.stats)
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
            setSelectedKds(new Set());
          }
          return;
        }

        // 1b. For cross-season we use the *second-latest* scan as the baseline.
        //     If anyone disappeared (was in penultimate, not in latest) or
        //     appeared (in latest but not in penultimate, or changed KD),
        //     they're flagged as migrated and removed from the candidate list.
        //     KvK uses the static MIG_FROM_DATE since the seed-day baseline
        //     is the relevant comparison there.
        if (season === 'cross') {
          const { data: penultRow } = await sb
            .from(config.tables.stats)
            .select('scan_date')
            .order('scan_date', { ascending: false })
            .range(1, 1);
          const penult = penultRow?.[0]?.scan_date as string | undefined;
          if (!cancelled) setCrossSeasonFromDate(penult ?? null);
        }

        // 2. Pull all KD stats for that date so we can derive seeds A/B/C/D
        //    and feed the summary table.
        const { data: stats, error: e2 } = await sb
          .from(config.tables.stats)
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
            .from(config.tables.players)
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
        // First load (or after a season switch reset): select every KD by
        // default. Otherwise preserve the user's selection on refetches.
        setSelectedKds((prev) => prev ?? new Set(kdStats.map((s) => s.kingdom_id)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [govIdFloor, season]);

  // Reset the KD multi-select when the user switches season — KvK and cross-
  // season have different KD pools, so an old selection would silently filter
  // the new list. Setting to null lets the main fetch effect default it to
  // "all visible" once the new KD list lands.
  useEffect(() => {
    setSelectedKds(null);
    setCrossSeasonFromDate(null);
  }, [season]);

  // Load the set of player_ids already in the outreach table so the Fill
  // button can render as "Added" instead of "Fill" without a duplicate insert.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await listOutreachIds(config.tables.outreach);
        if (!cancelled) setOutreachIds(ids);
      } catch (e) {
        console.warn('Failed to load outreach ids', e);
      }
    })();
    return () => { cancelled = true; };
  }, [config.tables.outreach]);

  // Toast banner shown once when the cross-season cleanup actually drops
  // someone from an outreach list. Cleared automatically after a few seconds.
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);

  // Load the set of "already migrated" player_ids so we can hide them from
  // the candidate list — somebody who migrated this KvK isn't a candidate
  // for migrating again. Re-runs whenever the latestDate or season changes.
  //
  // Cross-season uses a 0 floor: any KD change (or new joiner) between the
  // penultimate and latest scan disqualifies the player, regardless of power,
  // because they've already moved this season.
  useEffect(() => {
    if (!latestDate || !fromDate) return;
    let cancelled = false;
    (async () => {
      try {
        const floor = season === 'cross' ? 0 : undefined;
        const ids = await fetchMigratedPlayerIds(latestDate, floor, {
          tablePlayers: config.tables.players,
          fromDate,
        });
        if (cancelled) return;
        setMigratedIds(ids);
        // Auto-remove migrated players from BOTH outreach lists — once they've
        // moved, the original outreach can't reach them anymore. Idempotent:
        // only deletes rows that actually exist, so re-running is harmless.
        if (ids.size > 0) {
          try {
            const removed = await removeFromAllOutreach([...ids]);
            const total = Object.values(removed).reduce((a, b) => a + b, 0);
            if (!cancelled && total > 0) {
              const detail = Object.entries(removed)
                .filter(([, n]) => n > 0)
                .map(([t, n]) => `${n} from ${t}`)
                .join(', ');
              setCleanupNotice(`Auto-removed ${total} migrated player(s) from outreach (${detail}).`);
              window.setTimeout(() => setCleanupNotice(null), 6000);
              // Refresh the cached outreach id set so the Fill buttons reset.
              const fresh = await listOutreachIds(config.tables.outreach);
              if (!cancelled) setOutreachIds(fresh);
            }
          } catch (e) {
            console.warn('Outreach auto-cleanup failed', e);
          }
        }
      } catch (e) {
        console.warn('Failed to load migrated ids', e);
      }
    })();
    return () => { cancelled = true; };
  }, [latestDate, fromDate, config.tables.players, config.tables.outreach, season]);

  // Stable identity so memoized PlayerRow doesn't see a new function each render.
  const handleFill = useCallback(async (p: PlayerRow) => {
    if (!canEdit) return;
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
      }, config.tables.outreach);
      if (added) {
        setOutreachIds((s) => {
          const next = new Set(s);
          next.add(p.player_id);
          return next;
        });
      }
    } catch (e) {
      console.error('Failed to add to outreach', e);
      alert(`Failed to add: ${explainError(e)}`);
    } finally {
      setFillingId(null);
    }
  }, [outreachIds, config.tables.outreach, canEdit]);

  // Load the per-season exclusion set on mount / season switch so the filter
  // pipeline can drop those rows. The full list (with reason/timestamp) is
  // loaded lazily when the user opens the Excluded panel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await listExclusionIds(season);
        if (!cancelled) setExcludedIds(ids);
      } catch (e) {
        console.warn('Failed to load excluded ids', e);
      }
    })();
    return () => { cancelled = true; };
  }, [season]);

  const refreshExcludedList = useCallback(async () => {
    setExcludedListLoading(true);
    try {
      const rows = await listExclusions(season);
      setExcludedList(rows);
    } catch (e) {
      console.warn('Failed to load excluded list', e);
    } finally {
      setExcludedListLoading(false);
    }
  }, [season]);

  // Exclude flow: drop the player from the candidate list and store the
  // exclusion in Supabase. A simple confirm() guards accidental clicks since
  // the impact is "I never want to see this person in the candidates again".
  const handleExclude = useCallback(async (p: PlayerRow) => {
    if (!canEdit) return;
    if (excludedIds.has(p.player_id)) return;
    const label = `${p.name || 'Unknown'} (id ${p.player_id})`;
    if (!window.confirm(`Exclude ${label} from the ${SEASONS[season].label} candidates?\n\nThey'll be hidden from the list so you can't add them to outreach by mistake. You can restore them later from "Excluded".`)) {
      return;
    }
    setExcludingId(p.player_id);
    try {
      await addExclusion({ player_id: p.player_id, source: season });
      setExcludedIds((s) => {
        const next = new Set(s);
        next.add(p.player_id);
        return next;
      });
      // If the excluded panel is already open, keep its rows in sync.
      if (showExcludedPanel) await refreshExcludedList();
    } catch (e) {
      console.error('Failed to exclude', e);
      alert(`Failed to exclude: ${explainError(e)}`);
    } finally {
      setExcludingId(null);
    }
  }, [excludedIds, season, showExcludedPanel, refreshExcludedList, canEdit]);

  // Clear bulk selection whenever the user switches season — the ids belong
  // to the previous season's candidate pool and probably aren't visible now.
  useEffect(() => {
    setBulkSelection(new Set());
  }, [season]);

  const toggleBulkSelect = useCallback((playerId: number) => {
    setBulkSelection((s) => {
      const next = new Set(s);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const clearBulkSelection = useCallback(() => setBulkSelection(new Set()), []);

  // Bulk exclude flow — one confirm + one round-trip to Supabase via the
  // upsert helper. Skipping the per-row confirm dialog is the whole point.
  const handleBulkExclude = useCallback(async () => {
    if (!canEdit) return;
    if (bulkSelection.size === 0) return;
    const ids = [...bulkSelection];
    if (!window.confirm(`Exclude ${ids.length} player${ids.length === 1 ? '' : 's'} from the ${SEASONS[season].label} candidates?\n\nThey'll be hidden from the list. You can restore them later from "Excluded".`)) {
      return;
    }
    setBulkExcluding(true);
    try {
      await addExclusionsBulk(ids, season);
      setExcludedIds((s) => {
        const next = new Set(s);
        for (const id of ids) next.add(id);
        return next;
      });
      setBulkSelection(new Set());
      if (showExcludedPanel) await refreshExcludedList();
    } catch (e) {
      console.error('Failed to bulk-exclude', e);
      alert(`Failed to bulk-exclude: ${explainError(e)}`);
    } finally {
      setBulkExcluding(false);
    }
  }, [bulkSelection, canEdit, season, showExcludedPanel, refreshExcludedList]);

  const handleRestore = useCallback(async (playerId: number) => {
    if (!canEdit) return;
    try {
      await removeExclusion(playerId, season);
      setExcludedIds((s) => {
        const next = new Set(s);
        next.delete(playerId);
        return next;
      });
      setExcludedList((rows) => rows.filter((r) => r.player_id !== playerId));
    } catch (e) {
      console.error('Failed to restore', e);
      alert(`Failed to restore: ${explainError(e)}`);
    }
  }, [season, canEdit]);

  const toggleExcludedPanel = useCallback(async () => {
    const next = !showExcludedPanel;
    setShowExcludedPanel(next);
    if (next && excludedList.length === 0) await refreshExcludedList();
  }, [showExcludedPanel, excludedList.length, refreshExcludedList]);

  // Source rows: candidates across every selected KD, minus anyone already
  // listed on the Migrations tab (they've moved this KvK already), minus the
  // manual exclusions ("do not contact" list).
  const sourceRows = useMemo(() => {
    let raw = candidatePlayers;
    if (selectedKds && selectedKds.size < (statsByKd.size || Infinity)) {
      raw = raw.filter((p) => selectedKds.has(p.kingdom_id));
    }
    if (migratedIds.size > 0) raw = raw.filter((p) => !migratedIds.has(p.player_id));
    if (excludedIds.size > 0) raw = raw.filter((p) => !excludedIds.has(p.player_id));
    return raw;
  }, [selectedKds, candidatePlayers, migratedIds, excludedIds, statsByKd]);
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
  // Already-migrated and manually-excluded players are dropped so the count
  // matches what's actually shown in the player list below.
  const kdSummary = useMemo<KdSummary[]>(() => {
    const candidatesByKd = new Map<number, number>();
    for (const p of candidatePlayers) {
      if (p.kp < kpFloor) continue;
      if (migratedIds.has(p.player_id)) continue;
      if (excludedIds.has(p.player_id)) continue;
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
  }, [statsByKd, seedByKd, rankByKd, candidatePlayers, kpFloor, migratedIds, excludedIds]);

  // ─── Virtualizer for the player table ───
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 41, // approximate row height in px (table cell padding 0.625rem + line-height)
    overscan: 12,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const padTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const padBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      // numeric fields default desc; text defaults asc
      setSortDir(field === 'name' || field === 'rank_in_kd' || field === 'seed' || field === 'kingdom_id' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="mb-6">
        <Link
          href="/kingdom/kingdom-stats"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] mb-2"
        >
          <ArrowLeft size={12} /> Back to Kingdom Stats
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <UserPlus size={26} className="text-amber-400" />
              Possible candidates
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Latest scan: {latestDate ?? '—'} · baseline: {fromDate ?? '—'}. Highlighted rows = candidates with gov_id ≥ {govIdFloor.toLocaleString()}.
            </p>
          </div>
          <SeasonPicker season={season} onChange={setSeason} />
        </div>
      </div>

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          Read-only view — sign in as officer or admin to add players to outreach or exclude them from the list.
        </div>
      )}

      {cleanupNotice && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          {cleanupNotice}
        </div>
      )}

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

      {/* ─── KD multi-select toggles ─── */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Kingdoms</div>
          <div className="flex gap-1">
            <button
              onClick={() => setSelectedKds(new Set(kdSummary.map((s) => s.kingdom_id)))}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors"
            >
              All
            </button>
            <button
              onClick={() => setSelectedKds(new Set(kdSummary.filter((s) => s.candidates > 0).map((s) => s.kingdom_id)))}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors"
            >
              With candidates
            </button>
            <button
              onClick={() => setSelectedKds(new Set())}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-secondary)] transition-colors"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...kdSummary].sort((a, b) => a.kingdom_id - b.kingdom_id).map((s) => {
            const checked = selectedKds?.has(s.kingdom_id) ?? false;
            return (
              <button
                key={s.kingdom_id}
                onClick={() => {
                  setSelectedKds((prev) => {
                    const base = prev ?? new Set(kdSummary.map((x) => x.kingdom_id));
                    const next = new Set(base);
                    if (next.has(s.kingdom_id)) next.delete(s.kingdom_id); else next.add(s.kingdom_id);
                    return next;
                  });
                }}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
                  checked
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                    : 'bg-[var(--background-card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
                title={`KD ${s.kingdom_id} · ${s.candidates} candidate${s.candidates === 1 ? '' : 's'}`}
              >
                <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border text-[9px] ${checked ? 'bg-amber-300 border-amber-300 text-amber-900' : 'border-[var(--border)]'}`}>
                  {checked && <Check size={10} strokeWidth={3} />}
                </span>
                KD {s.kingdom_id}
                {s.candidates > 0 && <span className="text-[10px] opacity-80">· {s.candidates}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Filters (sticky so they stay visible while scrolling) ─── */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-4 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3">
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
            {migratedIds.size > 0 && (
              <span className="ml-2 text-cyan-300/80" title="Players already counted as migrated/joined in the Migrations tab — they can't migrate again, so they're hidden here.">
                · {migratedIds.size.toLocaleString()} migrated hidden
              </span>
            )}
            {excludedIds.size > 0 && (
              <span className="ml-2 text-rose-300/80" title="Players manually excluded from this season's candidates.">
                · {excludedIds.size.toLocaleString()} excluded
              </span>
            )}
          </span>

          {canEdit && (
            <button
              onClick={toggleExcludedPanel}
              disabled={excludedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/20 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title="View and restore manually excluded players"
            >
              <X size={14} /> Excluded ({excludedIds.size})
            </button>
          )}

          <Link
            href="/kingdom/migration-outreach"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-colors flex-shrink-0"
            title="Track contact attempts and responses for filled players"
          >
            Outreach list ({outreachIds.size}) →
          </Link>
        </div>
      </div>

      {/* ─── Excluded players panel (opens via toggle) ─── */}
      {showExcludedPanel && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-rose-500/20 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-rose-200">
              Excluded from {SEASONS[season].label} candidates
              <span className="text-rose-300/60 font-normal ml-2">({excludedIds.size})</span>
            </div>
            <button
              onClick={() => setShowExcludedPanel(false)}
              className="text-xs text-rose-300/70 hover:text-rose-200 transition-colors inline-flex items-center gap-1"
            >
              <ChevronUp size={12} /> Hide
            </button>
          </div>
          {excludedListLoading ? (
            <div className="p-4 text-sm text-[var(--text-muted)] text-center">Loading…</div>
          ) : excludedList.length === 0 ? (
            <div className="p-4 text-sm text-[var(--text-muted)] text-center">No exclusions for this season yet.</div>
          ) : (
            <ul className="divide-y divide-rose-500/10 max-h-80 overflow-auto">
              {excludedList.map((row) => (
                <li key={row.player_id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-rose-300/70 tabular-nums">{row.player_id}</div>
                    <div className="text-[var(--text-muted)] text-xs">
                      Excluded {new Date(row.excluded_at).toLocaleString()}
                      {row.excluded_by && ` · by ${row.excluded_by}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(row.player_id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors text-[11px] font-medium"
                    title="Restore this player to the candidates list"
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── KD summary table (collapsed by default) ─── */}
      <details className="group mb-6 rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
        <summary className="px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] cursor-pointer hover:bg-[var(--background-secondary)] transition-colors flex items-center justify-between list-none">
          <span className="flex items-center gap-2">
            <ChevronDown size={14} className="text-[var(--text-muted)] transition-transform group-open:rotate-180" />
            Kingdom summary <span className="text-[var(--text-muted)] font-normal">({kdSummary.length} KDs)</span>
          </span>
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
                  const isSelected = selectedKds?.has(row.kingdom_id) ?? false;
                  return (
                    <tr
                      key={row.kingdom_id}
                      onClick={() => setSelectedKds((prev) => {
                        const base = prev ?? new Set(kdSummary.map((x) => x.kingdom_id));
                        const next = new Set(base);
                        if (next.has(row.kingdom_id)) next.delete(row.kingdom_id);
                        else next.add(row.kingdom_id);
                        return next;
                      })}
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
              Click a row (or use the toggles below) to include / exclude that KD.
            </div>
          </div>
        )}
      </details>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ─── Bulk-action bar (only shown when at least one row is checked) ─── */}
      {canEdit && bulkSelection.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 rounded-lg border border-rose-500/40 bg-[var(--background-card)] shadow-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {bulkSelection.size} selected
          </span>
          <button
            onClick={() => {
              // Select every visible (post-filter) candidate. Skips rows
              // already in outreach since those have nothing to exclude.
              setBulkSelection((s) => {
                const next = new Set(s);
                for (const p of filteredAndSorted) {
                  if (!outreachIds.has(p.player_id)) next.add(p.player_id);
                }
                return next;
              });
            }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] underline-offset-2 hover:underline transition-colors"
          >
            Select all visible ({filteredAndSorted.length})
          </button>
          <button
            onClick={clearBulkSelection}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] underline-offset-2 hover:underline transition-colors"
          >
            Clear
          </button>
          <span className="ml-auto" />
          <button
            onClick={handleBulkExclude}
            disabled={bulkExcluding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-200 border border-rose-500/40 hover:bg-rose-500/30 transition-colors text-sm font-medium disabled:opacity-50"
            title="Exclude all selected players from the candidates list"
          >
            {bulkExcluding ? '…' : <><X size={14} /> Exclude {bulkSelection.size}</>}
          </button>
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
          <div ref={scrollRef} className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--background-secondary)]">
                <tr className="border-b border-[var(--border)]">
                  {canEdit && (
                    <th className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all visible candidates"
                        // Indeterminate is only meaningful when some-but-not-all
                        // visible rows are selected. We set it imperatively via
                        // ref since React doesn't expose it as a JSX attribute.
                        ref={(el) => {
                          if (!el) return;
                          const visibleSelectable = filteredAndSorted.filter((p) => !outreachIds.has(p.player_id));
                          const visibleSelected = visibleSelectable.filter((p) => bulkSelection.has(p.player_id)).length;
                          el.indeterminate = visibleSelected > 0 && visibleSelected < visibleSelectable.length;
                          el.checked = visibleSelectable.length > 0 && visibleSelected === visibleSelectable.length;
                        }}
                        onChange={(e) => {
                          const visibleSelectable = filteredAndSorted.filter((p) => !outreachIds.has(p.player_id));
                          if (e.target.checked) {
                            setBulkSelection((s) => {
                              const next = new Set(s);
                              for (const p of visibleSelectable) next.add(p.player_id);
                              return next;
                            });
                          } else {
                            setBulkSelection((s) => {
                              const next = new Set(s);
                              for (const p of visibleSelectable) next.delete(p.player_id);
                              return next;
                            });
                          }
                        }}
                      />
                    </th>
                  )}
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
                {padTop > 0 && (
                  <tr aria-hidden="true"><td colSpan={canEdit ? 9 : 8} style={{ height: padTop, padding: 0, border: 0 }} /></tr>
                )}
                {virtualItems.map((vrow) => {
                  const p = filteredAndSorted[vrow.index];
                  return (
                    <PlayerRowMemo
                      key={`${p.kingdom_id}-${p.player_id}`}
                      player={p}
                      seed={seedByKd.get(p.kingdom_id) ?? null}
                      isCandidate={p.player_id >= govIdFloor}
                      inOutreach={outreachIds.has(p.player_id)}
                      isFilling={fillingId === p.player_id}
                      isExcluding={excludingId === p.player_id}
                      canEdit={canEdit}
                      isSelected={bulkSelection.has(p.player_id)}
                      onToggleSelect={toggleBulkSelect}
                      onFill={handleFill}
                      onExclude={handleExclude}
                    />
                  );
                })}
                {padBottom > 0 && (
                  <tr aria-hidden="true"><td colSpan={canEdit ? 9 : 8} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized row — keeps unaffected rows out of React's reconciler when
// sorting / scrolling / filtering. Callbacks must be stable (see useCallback).
type PlayerRowComponentProps = {
  player: PlayerRow;
  seed: SeedAssignment;
  isCandidate: boolean;
  inOutreach: boolean;
  isFilling: boolean;
  isExcluding: boolean;
  /** When false, the row is read-only — the action buttons render as a
   *  muted "Sign in to act" hint instead of the Fill/Exclude buttons. */
  canEdit: boolean;
  isSelected: boolean;
  onToggleSelect: (playerId: number) => void;
  onFill: (p: PlayerRow) => void;
  onExclude: (p: PlayerRow) => void;
  style?: React.CSSProperties;
};

const PlayerRowMemo = memo(function PlayerRowMemo({ player: p, seed, isCandidate, inOutreach, isFilling, isExcluding, canEdit, isSelected, onToggleSelect, onFill, onExclude, style }: PlayerRowComponentProps) {
  return (
    <tr
      style={style}
      className={`border-b border-[var(--border)] transition-colors ${
        isSelected
          ? 'bg-rose-500/15 hover:bg-rose-500/20'
          : isCandidate
            ? 'bg-amber-500/10 hover:bg-amber-500/15'
            : 'hover:bg-[var(--background-secondary)]'
      }`}
    >
      {canEdit && (
        <td className="px-3 py-2.5 text-center">
          <input
            type="checkbox"
            aria-label={`Select ${p.name || p.player_id}`}
            checked={isSelected}
            disabled={inOutreach}
            onChange={() => onToggleSelect(p.player_id)}
            title={inOutreach ? 'Already in outreach' : 'Select for bulk exclude'}
          />
        </td>
      )}
      <td className="px-3 py-2.5 font-medium text-[var(--foreground)] tabular-nums">KD {p.kingdom_id}</td>
      <td className="px-3 py-2.5"><SeedBadge seed={seed} /></td>
      <td className={`px-3 py-2.5 text-xs tabular-nums ${isCandidate ? 'text-amber-300 font-medium' : 'text-[var(--text-muted)]'}`}>{p.player_id}</td>
      <td className="px-3 py-2.5 text-[var(--foreground)]">{p.name}</td>
      <td className="px-3 py-2.5 text-right text-indigo-400 tabular-nums">{formatCompact(p.power)}</td>
      <td className="px-3 py-2.5 text-right text-red-400 tabular-nums">{formatCompact(p.kp)}</td>
      <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{p.rank_in_kd}</td>
      <td className="px-3 py-2.5 text-right">
        {canEdit ? (
          <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
            {inOutreach ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium">
                <Check size={12} /> Added
              </span>
            ) : (
              <button
                onClick={() => onFill(p)}
                disabled={isFilling || isExcluding}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors text-[11px] font-medium disabled:opacity-50"
                title="Add this player to the migration outreach list"
              >
                {isFilling ? '…' : (<><Plus size={12} /> Candidate</>)}
              </button>
            )}
            <button
              onClick={() => onExclude(p)}
              disabled={isExcluding || isFilling}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-colors text-[11px] font-medium disabled:opacity-50"
              title="Hide this player from the candidates list so you can't add them to outreach by mistake"
            >
              {isExcluding ? '…' : (<><X size={12} /> Exclude</>)}
            </button>
          </div>
        ) : (
          inOutreach ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium">
              <Check size={12} /> Added
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)] italic" title="Sign in as officer or admin to add/exclude candidates">
              read-only
            </span>
          )
        )}
      </td>
    </tr>
  );
});

function SeasonPicker({ season, onChange }: { season: Season; onChange: (s: Season) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] uppercase tracking-wider">
      Season
      <select
        value={season}
        onChange={(e) => onChange(e.target.value as Season)}
        className={`px-3 py-2 rounded-lg border text-sm normal-case tracking-normal focus:outline-none ${
          season === 'cross'
            ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
            : 'bg-[var(--background-card)] border-[var(--border)] text-[var(--foreground)]'
        }`}
      >
        {(Object.values(SEASONS)).map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
    </label>
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
