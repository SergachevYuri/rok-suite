'use client';

// One unified table over the latest scan with toggleable filters for
// "Illegal arrivals" and "Power growers". Replaces the two cards that used
// to live in CandidatesPanel — same detection rules, but the user controls
// which filters are active and sees a single sortable, virtualized list.
//
// Heavy lifting:
//   - latestPlayers fetched once at mount (with coords merge from location_scan)
//   - Scan-A players + historical gov_id union are fetched only when the
//     respective filter toggle is on
//   - Row component is memoized + the table body is virtualized with
//     @tanstack/react-virtual so 12k+ rows stay snappy

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, Check, ChevronDown, ChevronUp, Plus, Search, Shield, UserPlus } from 'lucide-react';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import {
  KINGDOM_ID,
  listAllScans,
  loadLatestLocationPoints,
  loadUnifiedScanPlayers,
  type LocationPoint,
  type ScanRef,
  type UnifiedScanPlayer,
} from '@/lib/zero-list/scan-data';
import { listZeroListCases, bulkAddToZeroList } from '@/lib/supabase/use-migration-cases';
import { listClearanceIds, addClearance } from '@/lib/supabase/use-migration-clearances';
import { MIG_FROM_DATE } from '@/lib/kingdom/migrations';
import { CopyablePlayerCell } from '@/components/migration/CopyablePlayerCell';

interface MigrantDecision {
  decision: 'yes' | 'no' | 'maybe' | 'unknown';
  decisionRaw: string;
}

interface Props {
  isAdmin: boolean;
  actorName: string | null;
}

type SortField = 'name' | 'power' | 'kp' | 'alliance' | 'decision' | 'deltaPower';
type SortDir = 'asc' | 'desc';

type ReasonPreset = 'illegal' | 'power_grower' | 'violated_rule' | 'other';
const REASON_LABELS: Record<ReasonPreset, string> = {
  illegal: 'Illegal arrival',
  power_grower: 'Power grower',
  violated_rule: 'Violated rule',
  other: 'Other',
};

function fmtM(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
}

function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n / 1_000_000).toFixed(2)}M`;
}

function decisionRank(d: MigrantDecision | undefined): number {
  if (!d) return 99;
  return ({ yes: 0, no: 1, maybe: 2, unknown: 3 } as const)[d.decision] ?? 99;
}

export function GlobalCandidatesPanel({ isAdmin, actorName }: Props) {
  // ─── Shared base data (loaded once at mount) ───
  const [scans, setScans] = useState<ScanRef[]>([]);
  const [latestPlayers, setLatestPlayers] = useState<UnifiedScanPlayer[]>([]);
  /** Gov_ids that were already in the seed-day scan (MIG_FROM_DATE). Anyone in
   *  the latest scan but not in this set counts as a "new arrival" for the
   *  Illegal filter — admin then confirms / dismisses manually. */
  const [firstScanGovIds, setFirstScanGovIds] = useState<Set<number>>(new Set());
  /** Player_ids the admin has manually cleared as "not illegal". Hidden from
   *  the new-arrivals filter; persisted in migration_clearances. */
  const [clearanceIds, setClearanceIds] = useState<Set<number>>(new Set());
  const [zeroListIds, setZeroListIds] = useState<Set<number>>(new Set());
  const [cycleActiveIds, setCycleActiveIds] = useState<Set<number>>(new Set());
  const [decisionsByGov, setDecisionsByGov] = useState<Map<number, MigrantDecision>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allScans, zlist] = await Promise.all([listAllScans(), listZeroListCases()]);
      setScans(allScans);

      const latest = allScans[0] ?? null;
      let players = latest ? await loadUnifiedScanPlayers(latest) : [];

      // Merge coords + alliance from the latest location scan.
      try {
        const { points } = await loadLatestLocationPoints();
        if (points.length > 0) {
          const byGov = new Map<number, LocationPoint>();
          for (const p of points) byGov.set(p.governorId, p);
          players = players.map((p) => {
            const pt = byGov.get(p.governorId);
            if (!pt) return p;
            return { ...p, x: p.x ?? pt.x, y: p.y ?? pt.y, alliance: p.alliance ?? pt.alliance };
          });
        }
      } catch (e) {
        console.warn('Location merge failed', e);
      }

      setLatestPlayers(players);
      setZeroListIds(new Set(zlist.map((c) => c.character_id)));

      // First-scan baseline (cross-KD): everyone present at MIG_FROM_DATE.
      // Used to flag "new arrivals" — if they weren't here on seed day,
      // they showed up sometime after.
      try {
        const sb = createClient();
        const baseline = await fetchAllRows<{ player_id: number }>((range) =>
          sb
            .from('seeds_kd_players')
            .select('player_id')
            .eq('scan_date', MIG_FROM_DATE)
            .eq('kingdom_id', KINGDOM_ID) // K23-only: a player who was in
            // another kingdom on seed day and is in K23 now is exactly the
            // illegal-arrival case we want to surface.
            .range(range.from, range.to),
        );
        setFirstScanGovIds(new Set(baseline.map((r) => r.player_id)));
      } catch (e) {
        console.warn('First-scan baseline load failed', e);
      }

      // Manual clearances (admin "this one is fine" overrides).
      try {
        const cleared = await listClearanceIds();
        setClearanceIds(cleared);
      } catch (e) {
        console.warn('Clearance load failed', e);
      }

      const sb = createClient();
      const { data: cycleActive } = await sb
        .from('migration_cases')
        .select('character_id, state')
        .eq('source_kind', 'cycle');
      setCycleActiveIds(new Set(
        (cycleActive ?? [])
          .filter((c) => !['migrated', 'excepted', 'zeroed', 'afk'].includes(c.state as string))
          .map((c) => c.character_id as number),
      ));

      const decMap = new Map<number, MigrantDecision>();
      try {
        const r = await fetch('/api/migrant-sheet', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          for (const row of j.rows ?? []) {
            decMap.set(row.governorId, { decision: row.decision, decisionRaw: row.decisionRaw });
          }
        }
      } catch { /* migrant sheet best-effort */ }
      setDecisionsByGov(decMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // ─── Filter state ───
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('power');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Illegal filter — boolean only. "Illegal" here = "in the latest scan but
  // not in the seed-day scan" (i.e. someone who showed up after the start of
  // the KvK). The admin then confirms / dismisses manually via the checkboxes
  // and the Add-to-Zero-List flow.
  const [illegalOn, setIllegalOn] = useState(false);
  /** First K23 scan_date a player_id appears in, after MIG_FROM_DATE. Loaded
   *  lazily when the illegal filter is on so each illegal row can show
   *  exactly when the player first showed up in K23. */
  const [arrivedAtByGov, setArrivedAtByGov] = useState<Map<number, string>>(new Map());

  // Power grower filter
  const [growerOn, setGrowerOn] = useState(false);
  const [growerScanKey, setGrowerScanKey] = useState<string>('');
  const [growerThresholdM, setGrowerThresholdM] = useState<number>(0.5);

  // ─── On-demand load for the grower scan A ───
  const [scanAPlayers, setScanAPlayers] = useState<Map<string, UnifiedScanPlayer[]>>(new Map());
  const [filterLoading, setFilterLoading] = useState(false);

  // Default grower scan A to the second-most-recent same-kind scan
  useEffect(() => {
    if (scans.length === 0) return;
    const latest = scans[0];
    const sameKind = scans.filter((s) => s.kind === latest.kind);
    const fallback = sameKind[1] ?? sameKind[0];
    const key = `${fallback.kind}:${fallback.id}`;
    setGrowerScanKey((k) => k || key);
  }, [scans]);

  // Lazy-load scan-A players when the grower filter is on. Cached by key.
  useEffect(() => {
    if (!growerOn || !growerScanKey) return;
    if (scanAPlayers.has(growerScanKey)) return;
    let cancelled = false;
    (async () => {
      setFilterLoading(true);
      try {
        const ref = scans.find((s) => `${s.kind}:${s.id}` === growerScanKey);
        if (!ref) return;
        const data = await loadUnifiedScanPlayers(ref);
        if (cancelled) return;
        setScanAPlayers((m) => {
          const next = new Map(m);
          next.set(growerScanKey, data);
          return next;
        });
      } catch (e) {
        console.warn('Grower scan load failed', e);
      } finally {
        if (!cancelled) setFilterLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [growerOn, growerScanKey, scans, scanAPlayers]);

  // Load the first-seen scan_date for each illegal candidate. Runs once
  // per (illegalOn, latestPlayers, firstScanGovIds) change. We pull the
  // scan_dates only for the gov_ids that are actually flagged illegal so
  // the bulk query stays small.
  useEffect(() => {
    if (!illegalOn) return;
    if (latestPlayers.length === 0 || firstScanGovIds.size === 0) return;
    const candidates = latestPlayers
      .filter((p) => !firstScanGovIds.has(p.governorId))
      .map((p) => p.governorId);
    if (candidates.length === 0) {
      setArrivedAtByGov(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const minByGov = new Map<number, string>();
        const BATCH = 500;
        for (let i = 0; i < candidates.length; i += BATCH) {
          const slice = candidates.slice(i, i + BATCH);
          const { data, error } = await sb
            .from('seeds_kd_players')
            .select('player_id, scan_date')
            .eq('kingdom_id', KINGDOM_ID)
            .gt('scan_date', MIG_FROM_DATE)
            .in('player_id', slice);
          if (error) throw error;
          for (const r of data ?? []) {
            const id = r.player_id as number;
            const d = r.scan_date as string;
            const prev = minByGov.get(id);
            if (!prev || d < prev) minByGov.set(id, d);
          }
        }
        if (!cancelled) setArrivedAtByGov(minByGov);
      } catch (e) {
        console.warn('arrived-at load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [illegalOn, latestPlayers, firstScanGovIds]);

  // ─── Derived row list ───
  // For each visible row pre-compute the per-row classifications so the
  // sort / filter passes can stay O(N) and the memoized PlayerRow gets
  // stable, primitive props.
  type Row = {
    governorId: number;
    name: string;
    power: number;
    kp: number;
    alliance: string | null;
    x: number | null;
    y: number | null;
    decision: MigrantDecision | undefined;
    inCycle: boolean;
    onZeroList: boolean;
    isIllegal: boolean;
    isGrower: boolean;
    deltaPower: number; // 0 if grower filter off
    powerA: number;      // 0 if grower filter off
    /** First K23 scan_date this player appeared in (after MIG_FROM_DATE).
     *  Only populated for illegal rows once the lookup has loaded. */
    arrivedAt: string | null;
  };

  const rows = useMemo<Row[]>(() => {
    const growerAByGov  = growerOn  ? new Map((scanAPlayers.get(growerScanKey)  ?? []).map((p) => [p.governorId, p] as const)) : null;
    const growerThreshold = growerThresholdM * 1_000_000;

    const out: Row[] = [];
    for (const p of latestPlayers) {
      const decision = decisionsByGov.get(p.governorId);

      // "New arrival" candidate for illegal review: in latest, not in the
      // first scan (MIG_FROM_DATE), and not manually cleared by an admin.
      const isIllegal = illegalOn
        ? !firstScanGovIds.has(p.governorId) && !clearanceIds.has(p.governorId)
        : false;

      // Power grower: appears in both, delta ≥ threshold.
      let isGrower = false;
      let deltaPower = 0;
      let powerA = 0;
      if (growerOn && growerAByGov) {
        const a = growerAByGov.get(p.governorId);
        if (a) {
          deltaPower = p.power - a.power;
          powerA = a.power;
          if (deltaPower >= growerThreshold) isGrower = decision?.decision !== 'yes';
        }
      }

      out.push({
        governorId: p.governorId,
        name: p.name,
        power: p.power,
        kp: p.kp,
        alliance: p.alliance,
        x: p.x,
        y: p.y,
        decision,
        inCycle: cycleActiveIds.has(p.governorId),
        onZeroList: zeroListIds.has(p.governorId),
        isIllegal,
        isGrower,
        deltaPower,
        powerA,
        arrivedAt: isIllegal ? (arrivedAtByGov.get(p.governorId) ?? null) : null,
      });
    }
    return out;
  }, [latestPlayers, decisionsByGov, cycleActiveIds, zeroListIds, illegalOn, growerOn, growerScanKey, scanAPlayers, growerThresholdM, firstScanGovIds, clearanceIds, arrivedAtByGov]);

  const filteredAndSorted = useMemo(() => {
    let data = rows;
    // Filter rules: if a toggle is on, the row must pass *that* test. Both
    // toggles ON = AND.
    if (illegalOn) data = data.filter((r) => r.isIllegal);
    if (growerOn)  data = data.filter((r) => r.isGrower);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        String(r.governorId).includes(q) ||
        (r.alliance ?? '').toLowerCase().includes(q),
      );
    }
    const sign = sortDir === 'asc' ? 1 : -1;
    const sorted = [...data].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else if (sortField === 'alliance') cmp = (a.alliance ?? '').toLowerCase().localeCompare((b.alliance ?? '').toLowerCase());
      else if (sortField === 'decision') cmp = decisionRank(a.decision) - decisionRank(b.decision);
      else if (sortField === 'deltaPower') cmp = (a.deltaPower || 0) - (b.deltaPower || 0);
      else cmp = (a[sortField] || 0) - (b[sortField] || 0);
      if (cmp === 0) cmp = b.power - a.power;
      else cmp *= sign;
      return cmp;
    });
    return sorted;
  }, [rows, search, sortField, sortDir, illegalOn, growerOn]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(f);
      setSortDir(f === 'name' || f === 'alliance' || f === 'decision' ? 'asc' : 'desc');
    }
  };

  // ─── Selection + bulk add to Zero List ───
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  // Reason modal — shown when the user clicks "Add to Zero List". Lets the
  // officer pick a category and add a free-form note, instead of letting
  // the system auto-build the reason from the row flags. Auto flags
  // (illegal / grower / Δ power) are appended as metadata so we keep the
  // signal that drove the original detection.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState<ReasonPreset>('illegal');
  const [bulkNote, setBulkNote] = useState('');

  const toggleAll = () => {
    if (selected.size === filteredAndSorted.length) setSelected(new Set());
    else setSelected(new Set(filteredAndSorted.map((r) => r.governorId)));
  };
  const toggleOne = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Admin clicks "Legit" on a new-arrival row → adds to clearance and removes
  // from view. Optimistic update so the player disappears immediately.
  const markLegit = useCallback(async (playerId: number) => {
    setClearanceIds((prev) => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
    try {
      await addClearance(playerId, actorName ?? 'admin');
    } catch (e) {
      // Rollback on failure
      setClearanceIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
      alert(`Mark legit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [actorName]);


  const openBulkModal = () => {
    if (selected.size === 0) return;
    // Pre-select the most relevant preset based on the active filters.
    if (illegalOn && !growerOn) setBulkReason('illegal');
    else if (growerOn && !illegalOn) setBulkReason('power_grower');
    setBulkOpen(true);
  };

  const confirmBulk = async () => {
    const chosen = filteredAndSorted.filter((r) => selected.has(r.governorId));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const baseLabel = REASON_LABELS[bulkReason];
      const note = bulkNote.trim();
      const userPart = note ? `${baseLabel} — ${note}` : baseLabel;
      // Per-row metadata trail: which auto-flags fired, so the Zero List can
      // tell at a glance "officer chose 'violated rule' but row was also illegal".
      const reasonFor = (r: Row) => {
        const auto: string[] = [];
        if (r.isIllegal) auto.push('illegal arrival');
        if (r.isGrower) auto.push(`Δ power growth ${fmtDelta(r.deltaPower)}`);
        if (r.decision) auto.push(`decision: ${r.decision.decisionRaw || r.decision.decision}`);
        return auto.length === 0 ? userPart : `${userPart} (auto: ${auto.join(' · ')})`;
      };
      const { added, skipped } = await bulkAddToZeroList(
        chosen.map((r) => ({
          characterId: r.governorId,
          username: r.name,
          power: r.power,
          x: r.x,
          y: r.y,
          alliance: r.alliance,
          lastSeenScanId: null,
          addedBy: actorName ?? 'admin',
          reason: reasonFor(r),
        })),
      );
      setSelected(new Set());
      setBulkOpen(false);
      setBulkNote('');
      await refresh();
      if (skipped > 0) alert(`Added ${added}. ${skipped} ${skipped === 1 ? 'was' : 'were'} already on the Zero List.`);
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
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

  // ─── Render ───
  if (loading && latestPlayers.length === 0) {
    return <div className="text-sm text-[var(--text-muted)] py-8 text-center">Loading scan data…</div>;
  }
  if (error) {
    return <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300">Failed to load: {error}</div>;
  }
  if (latestPlayers.length === 0) {
    return <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-6 text-sm text-amber-300">No scans available yet.</div>;
  }

  const sameKindScans = scans.filter((s) => s.kind === scans[0]?.kind);
  // Header columns: [checkbox?] Name, GovId, Power, KP, ΔPower, Alliance, Decision
  const colCount = isAdmin ? 8 : 7;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterToggle
            on={illegalOn}
            label="New arrivals only"
            icon={<UserPlus size={13} />}
            tone="cyan"
            onToggle={() => setIllegalOn((v) => !v)}
          />
          {illegalOn && (
            <span
              className="text-[11px] text-[var(--text-muted)]"
              title={`Players who are in the latest scan but were not in the seed-day baseline (${MIG_FROM_DATE}). Confirm manually which ones are illegal.`}
            >
              vs <span className="font-mono text-[var(--text-secondary)]">{MIG_FROM_DATE}</span>
            </span>
          )}

          <span className="w-px h-5 bg-[var(--border)] mx-1" />

          <FilterToggle
            on={growerOn}
            label="Power growers only"
            icon={<ArrowUp size={13} />}
            tone="orange"
            onToggle={() => setGrowerOn((v) => !v)}
          />
          {growerOn && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] uppercase tracking-wider">
                vs
                <select
                  value={growerScanKey}
                  onChange={(e) => setGrowerScanKey(e.target.value)}
                  className="px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] normal-case tracking-normal focus:outline-none focus:border-[#4318ff]"
                >
                  {sameKindScans.filter((s) => `${s.kind}:${s.id}` !== `${scans[0]?.kind}:${scans[0]?.id}`).map((s) => (
                    <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] uppercase tracking-wider">
                Δ ≥
                <input
                  type="text"
                  inputMode="decimal"
                  value={growerThresholdM}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, '');
                    const n = raw === '' ? 0 : Number(raw);
                    if (!Number.isNaN(n)) setGrowerThresholdM(Math.max(0, n));
                  }}
                  className="w-16 px-2 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-mono focus:outline-none"
                />
                <span className="text-xs text-[var(--text-muted)] normal-case">M</span>
              </label>
            </>
          )}

          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / gov id / alliance…"
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#4318ff]"
            />
          </div>

          <span className="text-xs text-[var(--text-muted)] tabular-nums ml-auto inline-flex items-center gap-2">
            {filterLoading && <span className="text-cyan-300/80">loading filter…</span>}
            {illegalOn && clearanceIds.size > 0 && (
              <span
                className="text-emerald-400/80"
                title={`${clearanceIds.size} player${clearanceIds.size === 1 ? '' : 's'} marked legit and hidden from this view.`}
              >
                {clearanceIds.size} cleared
              </span>
            )}
            <span>{filteredAndSorted.length.toLocaleString()} / {rows.length.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* Bulk action */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <span className="text-xs text-orange-300">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">Clear</button>
            <button disabled={busy} onClick={openBulkModal} className="px-2 py-1 text-[11px] rounded bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 disabled:opacity-60">
              Add to Zero List…
            </button>
          </div>
        </div>
      )}

      {/* Reason picker modal */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => !busy && setBulkOpen(false)}
        >
          <div
            className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-5 max-w-md w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Add {selected.size} player{selected.size === 1 ? '' : 's'} to the Zero List
            </h3>

            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Reason</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(REASON_LABELS) as ReasonPreset[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setBulkReason(k)}
                    className={`px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                      bulkReason === k
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                        : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {REASON_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Note (optional)</label>
              <textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="e.g. attacking MNG members during peace, refused to leave, etc."
                rows={3}
                className="w-full px-2 py-1.5 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#4318ff] resize-y"
              />
              <div className="text-[10px] text-[var(--text-muted)]">
                Any auto-flags (illegal / grower / migrant decision) are appended as metadata.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setBulkOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-md text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulk}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-md bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 disabled:opacity-60"
              >
                {busy ? 'Adding…' : `Add ${selected.size} to Zero List`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Virtualized table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
        {filteredAndSorted.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--text-muted)]">No players match the current filters.</div>
        ) : (
          <div ref={scrollRef} className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--background-secondary)] text-[var(--text-muted)] uppercase tracking-wider">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" checked={selected.size > 0 && selected.size === filteredAndSorted.length} onChange={toggleAll} />
                    </th>
                  )}
                  <SortTh label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-left">Gov ID</th>
                  <SortTh label="Power" field="power" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="KP" field="kp" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="Δ Power" field="deltaPower" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="Alliance" field="alliance" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Decision" field="decision" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {padTop > 0 && <tr aria-hidden="true"><td colSpan={colCount} style={{ height: padTop, padding: 0, border: 0 }} /></tr>}
                {virtualItems.map((vrow) => {
                  const r = filteredAndSorted[vrow.index];
                  return (
                    <PlayerRowMemo
                      key={r.governorId}
                      row={r}
                      isAdmin={isAdmin}
                      checked={selected.has(r.governorId)}
                      onToggle={toggleOne}
                      onMarkLegit={illegalOn && isAdmin ? markLegit : undefined}
                    />
                  );
                })}
                {padBottom > 0 && <tr aria-hidden="true"><td colSpan={colCount} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function FilterToggle({ on, label, icon, tone, onToggle }: { on: boolean; label: string; icon: React.ReactNode; tone: 'cyan' | 'orange'; onToggle: () => void }) {
  const colorOn = tone === 'cyan' ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200' : 'bg-orange-500/20 border-orange-500/40 text-orange-200';
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
        on ? colorOn : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
      }`}
    >
      <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border ${on ? (tone === 'cyan' ? 'bg-cyan-300 border-cyan-300 text-cyan-900' : 'bg-orange-300 border-orange-300 text-orange-900') : 'border-[var(--border)]'}`}>
        {on && <Check size={10} strokeWidth={3} />}
      </span>
      {icon}
      {label}
    </button>
  );
}

function SortTh({ label, field, sortField, sortDir, onSort, align = 'left' }: {
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
      className={`px-3 py-2 cursor-pointer hover:text-[var(--foreground)] select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ChevronDown size={12} className="opacity-20" />}
      </span>
    </th>
  );
}

type RowType = {
  governorId: number;
  name: string;
  power: number;
  kp: number;
  alliance: string | null;
  x: number | null;
  y: number | null;
  decision: MigrantDecision | undefined;
  inCycle: boolean;
  onZeroList: boolean;
  isIllegal: boolean;
  isGrower: boolean;
  deltaPower: number;
  powerA: number;
  arrivedAt: string | null;
};

const PlayerRowMemo = memo(function PlayerRowMemo({ row: r, isAdmin, checked, onToggle, onMarkLegit }: {
  row: RowType;
  isAdmin: boolean;
  checked: boolean;
  onToggle: (id: number) => void;
  /** When provided, renders a "Legit" button on the row that the admin can
   *  click to clear this new-arrival from the illegal-review list. */
  onMarkLegit?: (id: number) => void;
}) {
  return (
    <tr className={`border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors ${
      r.isIllegal ? 'bg-cyan-500/5' : r.isGrower ? 'bg-orange-500/5' : ''
    }`}>
      {isAdmin && (
        <td className="px-3 py-2">
          <input type="checkbox" checked={checked} onChange={() => onToggle(r.governorId)} />
        </td>
      )}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CopyablePlayerCell name={r.name} govId={r.governorId} />
          {r.isIllegal && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" title="Wasn't in the seed-day scan — pending review">illegal?</span>}
          {r.isIllegal && r.arrivedAt && (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 tabular-nums"
              title={`First seen in K23 on ${r.arrivedAt}`}
            >
              {r.arrivedAt}
            </span>
          )}
          {r.inCycle && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-rose-500/15 text-rose-400 border border-rose-500/30">in cycle</span>}
          {r.onZeroList && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-orange-500/15 text-orange-400 border border-orange-500/30">on zero list</span>}
          {onMarkLegit && r.isIllegal && (
            <button
              onClick={() => onMarkLegit(r.governorId)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
              title="Mark this player as legit — they'll be hidden from the new-arrivals view going forward."
            >
              ✓ Legit
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">{r.governorId}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(r.power)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(r.kp)}</td>
      <td className={`px-3 py-2 text-right font-mono tabular-nums ${r.isGrower ? 'text-orange-300 font-semibold' : r.deltaPower > 0 ? 'text-orange-300/70' : r.deltaPower < 0 ? 'text-rose-400/70' : 'text-[var(--text-muted)]'}`}
          title={r.deltaPower !== 0 ? `Was ${fmtM(r.powerA)} on the previous scan` : undefined}>
        {r.deltaPower !== 0 ? fmtDelta(r.deltaPower) : '—'}
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)]">{r.alliance || '—'}</td>
      <td className="px-3 py-2">
        {r.decision ? <DecisionBadge d={r.decision.decision} raw={r.decision.decisionRaw} /> : <span className="text-[var(--text-muted)]">—</span>}
      </td>
    </tr>
  );
});

function DecisionBadge({ d, raw }: { d: 'yes' | 'no' | 'maybe' | 'unknown'; raw?: string }) {
  const styles: Record<typeof d, string> = {
    yes: 'bg-green-500/15 text-green-400 border-green-500/30',
    no: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    maybe: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  const fallback = { yes: 'Yes', no: 'No', maybe: 'Maybe', unknown: '—' };
  const label = raw && raw.trim().length > 0 ? raw : fallback[d];
  return <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${styles[d]}`}>{label}</span>;
}

// keep tree-shake happy on unused icon imports while keeping the existing
// vocabulary aligned with the rest of the migration UI
void Shield;
void Plus;
