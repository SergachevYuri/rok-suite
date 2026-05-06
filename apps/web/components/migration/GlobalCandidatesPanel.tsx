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
import { createClient } from '@/lib/supabase/client';
import {
  listAllScans,
  loadHistoricalGovIds,
  loadLatestLocationPoints,
  loadUnifiedScanPlayers,
  type LocationPoint,
  type ScanRef,
  type UnifiedScanPlayer,
} from '@/lib/zero-list/scan-data';
import { listZeroListCases, bulkAddToZeroList } from '@/lib/supabase/use-migration-cases';
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

  // Illegal filter
  const [illegalOn, setIllegalOn] = useState(false);
  const [illegalScanKey, setIllegalScanKey] = useState<string>('');

  // Power grower filter
  const [growerOn, setGrowerOn] = useState(false);
  const [growerScanKey, setGrowerScanKey] = useState<string>('');
  const [growerThresholdM, setGrowerThresholdM] = useState<number>(0.5);

  // ─── On-demand loads driven by filters ───
  const [scanAPlayers, setScanAPlayers] = useState<Map<string, UnifiedScanPlayer[]>>(new Map());
  const [historicalIds, setHistoricalIds] = useState<Map<string, Set<number>>>(new Map());
  const [filterLoading, setFilterLoading] = useState(false);

  // Default scan A keys to the second-most-recent same-kind scan
  useEffect(() => {
    if (scans.length === 0) return;
    const latest = scans[0];
    const sameKind = scans.filter((s) => s.kind === latest.kind);
    const fallback = sameKind[1] ?? sameKind[0];
    const key = `${fallback.kind}:${fallback.id}`;
    setIllegalScanKey((k) => k || key);
    setGrowerScanKey((k) => k || key);
  }, [scans]);

  // Lazy-load scan-A players + historical ids when the corresponding filter
  // is on. Cached by scan key so re-toggling is instant.
  useEffect(() => {
    if (!illegalOn && !growerOn) return;
    let cancelled = false;
    (async () => {
      setFilterLoading(true);
      try {
        const keysWanted = new Set<string>();
        if (illegalOn && illegalScanKey) keysWanted.add(illegalScanKey);
        if (growerOn && growerScanKey) keysWanted.add(growerScanKey);

        for (const k of keysWanted) {
          if (!scanAPlayers.has(k)) {
            const ref = scans.find((s) => `${s.kind}:${s.id}` === k);
            if (!ref) continue;
            const data = await loadUnifiedScanPlayers(ref);
            if (cancelled) return;
            setScanAPlayers((m) => {
              const next = new Map(m);
              next.set(k, data);
              return next;
            });
          }
        }

        if (illegalOn && illegalScanKey && !historicalIds.has(illegalScanKey)) {
          const ref = scans.find((s) => `${s.kind}:${s.id}` === illegalScanKey);
          if (ref) {
            const { ids } = await loadHistoricalGovIds(ref.ts);
            if (cancelled) return;
            setHistoricalIds((m) => {
              const next = new Map(m);
              next.set(illegalScanKey, ids);
              return next;
            });
          }
        }
      } catch (e) {
        console.warn('Filter load failed', e);
      } finally {
        if (!cancelled) setFilterLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [illegalOn, growerOn, illegalScanKey, growerScanKey, scans, scanAPlayers, historicalIds]);

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
  };

  const rows = useMemo<Row[]>(() => {
    const illegalAByGov = illegalOn ? new Map((scanAPlayers.get(illegalScanKey) ?? []).map((p) => [p.governorId, p] as const)) : null;
    const growerAByGov  = growerOn  ? new Map((scanAPlayers.get(growerScanKey)  ?? []).map((p) => [p.governorId, p] as const)) : null;
    const histIds = illegalOn ? historicalIds.get(illegalScanKey) : null;
    const growerThreshold = growerThresholdM * 1_000_000;

    const out: Row[] = [];
    for (const p of latestPlayers) {
      const decision = decisionsByGov.get(p.governorId);

      // Illegal arrivals: in latest, NOT in scan A, never in any historical scan.
      let isIllegal = false;
      if (illegalOn && illegalAByGov && histIds) {
        if (!illegalAByGov.has(p.governorId) && !histIds.has(p.governorId)) {
          isIllegal = decision?.decision !== 'yes';
        }
      }

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
      });
    }
    return out;
  }, [latestPlayers, decisionsByGov, cycleActiveIds, zeroListIds, illegalOn, growerOn, illegalScanKey, growerScanKey, scanAPlayers, historicalIds, growerThresholdM]);

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

  const addSelected = async () => {
    if (selected.size === 0) return;
    const chosen = filteredAndSorted.filter((r) => selected.has(r.governorId));
    if (!confirm(`Add ${chosen.length} player${chosen.length === 1 ? '' : 's'} to the Zero List?`)) return;
    setBusy(true);
    try {
      const reasonFor = (r: Row) => {
        const tags: string[] = [];
        if (r.isIllegal) tags.push('illegal arrival');
        if (r.isGrower) tags.push(`Δ power growth ${fmtDelta(r.deltaPower)}`);
        if (tags.length === 0) tags.push('manual review');
        if (r.decision) tags.push(`decision: ${r.decision.decisionRaw || r.decision.decision}`);
        return tags.join(' · ');
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
  const colCount = isAdmin ? 7 : 6;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterToggle
            on={illegalOn}
            label="Illegal only"
            icon={<UserPlus size={13} />}
            tone="cyan"
            onToggle={() => setIllegalOn((v) => !v)}
          />
          {illegalOn && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] uppercase tracking-wider">
              vs
              <select
                value={illegalScanKey}
                onChange={(e) => setIllegalScanKey(e.target.value)}
                className="px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] normal-case tracking-normal focus:outline-none focus:border-[#4318ff]"
              >
                {sameKindScans.filter((s) => `${s.kind}:${s.id}` !== `${scans[0]?.kind}:${scans[0]?.id}`).map((s) => (
                  <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.label}</option>
                ))}
              </select>
            </label>
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

          <span className="text-xs text-[var(--text-muted)] tabular-nums ml-auto">
            {filterLoading && <span className="text-cyan-300/80 mr-2">loading filter…</span>}
            {filteredAndSorted.length.toLocaleString()} / {rows.length.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Bulk action */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <span className="text-xs text-orange-300">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">Clear</button>
            <button disabled={busy} onClick={addSelected} className="px-2 py-1 text-[11px] rounded bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 disabled:opacity-60">
              {busy ? 'Adding…' : 'Add to Zero List'}
            </button>
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
};

const PlayerRowMemo = memo(function PlayerRowMemo({ row: r, isAdmin, checked, onToggle }: {
  row: RowType;
  isAdmin: boolean;
  checked: boolean;
  onToggle: (id: number) => void;
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
          {r.isIllegal && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">illegal</span>}
          {r.isGrower && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/30" title={`Δ ${fmtDelta(r.deltaPower)} (was ${fmtM(r.powerA)})`}>+{fmtDelta(r.deltaPower)}</span>}
          {r.inCycle && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-rose-500/15 text-rose-400 border border-rose-500/30">in cycle</span>}
          {r.onZeroList && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-orange-500/15 text-orange-400 border border-orange-500/30">on zero list</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">{r.governorId}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(r.power)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(r.kp)}</td>
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
