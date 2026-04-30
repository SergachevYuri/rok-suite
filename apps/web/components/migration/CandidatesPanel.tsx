'use client';

// Task-driven view of the Scans tab. Replaces the old "pick a data source, pick
// a sub-view, multi-select rows" flow with four intent cards that map directly
// to the questions admins ask:
//
//   1. Who grew power since [date]?
//   2. Who immigrated illegally (new since [date], not on the Yes list)?
//   3. Who didn't emigrate (cycle cases past deadline, still in kingdom)?
//   4. Top N power — who do we still need to evaluate?
//
// All four share the same shape: a card with date/threshold inputs, a count,
// and an inline review-and-bulk-add table.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUp, ChevronDown, RotateCcw, UserPlus, Users, Trophy } from 'lucide-react';
import {
  listAllScans,
  loadUnifiedScanPlayers,
  loadLatestLocationPoints,
  loadHistoricalGovIds,
  type ScanRef,
  type UnifiedScanPlayer,
  type LocationPoint,
} from '@/lib/zero-list/scan-data';
import {
  listZeroListCases,
  bulkAddToZeroList,
} from '@/lib/supabase/use-migration-cases';
import { createClient } from '@/lib/supabase/client';

interface Props {
  isAdmin: boolean;
  actorName: string | null;
}

interface MigrantDecision {
  decision: 'yes' | 'no' | 'maybe' | 'unknown';
  decisionRaw: string;
}

interface CycleLeftover {
  characterId: number;
  username: string;
  cycleName: string;
  cycleDeadline: string;
  state: string;
  powerAtOpen: number;
}

interface SharedData {
  scans: ScanRef[];
  latest: ScanRef | null;
  /** Latest scan players with coords merged in from the most recent location scan if available. */
  latestPlayers: UnifiedScanPlayer[];
  zeroListIds: Set<number>;
  cycleActiveIds: Set<number>;
  decisionsByGov: Map<number, MigrantDecision>;
  cycleLeftovers: CycleLeftover[];
  /** Latest location-scan timestamp + label, for showing in the header. */
  locationScanLabel: string | null;
  locationScanTs: string | null;
}

function fmtM(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
}

function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n / 1_000_000).toFixed(2)}M`;
}

const DATE_PRESETS: { id: string; label: string; daysAgo: number }[] = [
  { id: '1d', label: 'Yesterday', daysAgo: 1 },
  { id: '3d', label: '3 days', daysAgo: 3 },
  { id: '1w', label: '1 week', daysAgo: 7 },
  { id: '2w', label: '2 weeks', daysAgo: 14 },
  { id: '1m', label: '1 month', daysAgo: 30 },
];

/** Find the scan with the closest timestamp to (now - daysAgo days). */
function findScanByDaysAgo(scans: ScanRef[], daysAgo: number): ScanRef | null {
  if (scans.length === 0) return null;
  const target = Date.now() - daysAgo * 86_400_000;
  let best = scans[0];
  let bestDiff = Math.abs(new Date(best.ts).getTime() - target);
  for (const s of scans) {
    const diff = Math.abs(new Date(s.ts).getTime() - target);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

/** Best-effort match: which preset is closest to the chosen scan? */
function presetForScan(scans: ScanRef[], scanKey: string): string {
  const ref = scans.find((s) => `${s.kind}:${s.id}` === scanKey);
  if (!ref) return 'custom';
  const ageDays = (Date.now() - new Date(ref.ts).getTime()) / 86_400_000;
  let closest = DATE_PRESETS[0];
  let closestDiff = Math.abs(closest.daysAgo - ageDays);
  for (const p of DATE_PRESETS) {
    const d = Math.abs(p.daysAgo - ageDays);
    if (d < closestDiff) {
      closest = p;
      closestDiff = d;
    }
  }
  // Only snap to a preset if the chosen scan is within 1.5 days of it. Otherwise call it custom.
  return closestDiff <= 1.5 ? closest.id : 'custom';
}

function DatePresetPicker({
  scans,
  scanKey,
  onChange,
  excludeKey,
  label = 'vs:',
}: {
  scans: ScanRef[];
  scanKey: string;
  onChange: (scanKey: string) => void;
  /** Don't allow selecting the same scan as the comparison target (i.e. the latest). */
  excludeKey?: string;
  label?: string;
}) {
  const usable = scans.filter((s) => `${s.kind}:${s.id}` !== excludeKey);
  const activePreset = presetForScan(usable, scanKey);
  const [showCustom, setShowCustom] = useState(activePreset === 'custom');

  const pickPreset = (presetId: string) => {
    if (presetId === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const preset = DATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const ref = findScanByDaysAgo(usable, preset.daysAgo);
    if (ref) onChange(`${ref.kind}:${ref.id}`);
  };

  const activeRef = usable.find((s) => `${s.kind}:${s.id}` === scanKey);
  const activeAgeDays = activeRef ? Math.round((Date.now() - new Date(activeRef.ts).getTime()) / 86_400_000) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider mr-1">{label}</span>
      {DATE_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => pickPreset(p.id)}
          className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
            activePreset === p.id && !showCustom
              ? 'bg-[#4318ff] border-[#4318ff] text-white'
              : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => pickPreset('custom')}
        className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
          activePreset === 'custom' || showCustom
            ? 'bg-[#4318ff] border-[#4318ff] text-white'
            : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
        }`}
      >
        Custom
      </button>
      {(showCustom || activePreset === 'custom') && (
        <select
          value={scanKey}
          onChange={(e) => onChange(e.target.value)}
          className="ml-1 px-2 py-1 rounded-md bg-[var(--background-secondary)] border border-[var(--border)] text-[11px] focus:outline-none max-w-[280px]"
        >
          {usable.map((s) => (
            <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.label}</option>
          ))}
        </select>
      )}
      {activeAgeDays !== null && (
        <span className="text-[10px] text-[var(--text-muted)] ml-1">
          ({activeAgeDays === 0 ? 'today' : activeAgeDays === 1 ? '1 day ago' : `${activeAgeDays} days ago`})
        </span>
      )}
    </div>
  );
}

export function CandidatesPanel({ isAdmin, actorName }: Props) {
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Scans
      const scans = await listAllScans();
      const latest = scans[0] ?? null;
      let latestPlayers = latest ? await loadUnifiedScanPlayers(latest) : [];

      // 1b. Merge in coords + alliance from the most recent location scan, if any
      let locationScanLabel: string | null = null;
      let locationScanTs: string | null = null;
      try {
        const { scan: locScan, points } = await loadLatestLocationPoints();
        if (locScan && points.length > 0) {
          locationScanLabel = locScan.label;
          locationScanTs = locScan.created_at;
          const byGov = new Map<number, LocationPoint>();
          for (const p of points) byGov.set(p.governorId, p);
          latestPlayers = latestPlayers.map((p) => {
            const pt = byGov.get(p.governorId);
            if (!pt) return p;
            return {
              ...p,
              x: p.x ?? pt.x,
              y: p.y ?? pt.y,
              alliance: p.alliance ?? pt.alliance,
            };
          });
        }
      } catch (e) {
        console.warn('Location-scan merge failed (non-fatal)', e);
      }

      // 2. Zero list IDs (so we can exclude already-listed)
      const zlist = await listZeroListCases();
      const zeroListIds = new Set(zlist.map((c) => c.character_id));

      // 3. Active cycle IDs (so top-400 / new-arrivals don't double-flag people
      //    already in a cycle being worked)
      const sb = createClient();
      const { data: cycleActive } = await sb
        .from('migration_cases')
        .select('character_id, state')
        .eq('source_kind', 'cycle');
      const cycleActiveIds = new Set(
        (cycleActive ?? [])
          .filter((c) => !['migrated', 'excepted', 'zeroed', 'afk'].includes(c.state as string))
          .map((c) => c.character_id as number),
      );

      // 4. Cycle leftovers — past deadline, not terminal, still trackable
      const { data: leftoverCycles } = await sb
        .from('migration_cycles')
        .select('id, name, deadline, closed_at');
      const leftovers: CycleLeftover[] = [];
      const now = Date.now();
      for (const cy of leftoverCycles ?? []) {
        const dl = new Date(cy.deadline as string).getTime();
        // Only show cycles whose deadline has passed
        if (dl > now && !cy.closed_at) continue;
        const { data: cases } = await sb
          .from('migration_cases')
          .select('character_id, username, state, power_at_open')
          .eq('source_kind', 'cycle')
          .eq('cycle_id', cy.id)
          .in('state', ['pending', 'claimed', 'contacted', 'marked_to_zero']);
        for (const c of cases ?? []) {
          if (zeroListIds.has(c.character_id as number)) continue; // already moved
          leftovers.push({
            characterId: c.character_id as number,
            username: c.username as string,
            cycleName: cy.name as string,
            cycleDeadline: cy.deadline as string,
            state: c.state as string,
            powerAtOpen: c.power_at_open as number,
          });
        }
      }

      // 5. Migrant sheet decisions
      const decisionsByGov = new Map<number, MigrantDecision>();
      try {
        const r = await fetch('/api/migrant-sheet', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          for (const row of j.rows ?? []) {
            decisionsByGov.set(row.governorId, { decision: row.decision, decisionRaw: row.decisionRaw });
          }
        }
      } catch {
        /* migrant sheet is best-effort */
      }

      setData({
        scans,
        latest,
        latestPlayers,
        zeroListIds,
        cycleActiveIds,
        decisionsByGov,
        cycleLeftovers: leftovers,
        locationScanLabel,
        locationScanTs,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !data) {
    return <div className="text-sm text-[var(--text-muted)] py-8 text-center">Loading candidates…</div>;
  }
  if (error) {
    return <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300">Failed to load: {error}</div>;
  }
  if (!data || !data.latest) {
    return (
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-6 text-sm text-amber-300">
        No scans available. Run a scan via the auto-scraper or upload a manual scan to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-xs text-[var(--text-muted)] space-y-0.5">
          <div>
            Latest scan: <span className="text-[var(--text-secondary)]">{data.latest.label}</span>
            {' · '}
            {data.zeroListIds.size} on Zero List · {data.cycleActiveIds.size} in active cycles
          </div>
          {data.locationScanLabel ? (
            <div>
              Coordinates from: <span className="text-[var(--text-secondary)]">{data.locationScanLabel}</span>
              {data.locationScanTs && <> ({new Date(data.locationScanTs).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})</>}
            </div>
          ) : (
            <div className="text-amber-400">
              No location scan uploaded yet — coords will be empty until an admin uploads via <em>Location Upload</em>.
            </div>
          )}
        </div>
        <button
          onClick={() => void refresh()}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors flex-shrink-0"
          title="Refresh all data"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <PowerGrowersCard data={data} isAdmin={isAdmin} actorName={actorName} onChange={refresh} />
      <IllegalArrivalsCard data={data} isAdmin={isAdmin} actorName={actorName} onChange={refresh} />
      <CycleLeftoversCard data={data} isAdmin={isAdmin} actorName={actorName} onChange={refresh} />
      <TopNCard data={data} isAdmin={isAdmin} actorName={actorName} onChange={refresh} />
    </div>
  );
}

// ─── Card 1: Power growers ───────────────────────────────────────────────────

function PowerGrowersCard({ data, isAdmin, actorName, onChange }: { data: SharedData; isAdmin: boolean; actorName: string | null; onChange: () => Promise<void> | void }) {
  // Scan B = newest, scan A = pick from same source if available
  const sameKindScans = data.scans.filter((s) => s.kind === data.latest!.kind);
  const defaultA = sameKindScans[1] ?? sameKindScans[0];
  const [aKey, setAKey] = useState<string>(`${defaultA.kind}:${defaultA.id}`);
  const [thresholdM, setThresholdM] = useState<number>(0.5); // millions
  const [aPlayers, setAPlayers] = useState<UnifiedScanPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ref = data.scans.find((s) => `${s.kind}:${s.id}` === aKey);
    if (!ref) return;
    setLoading(true);
    void loadUnifiedScanPlayers(ref).then(setAPlayers).finally(() => setLoading(false));
  }, [aKey, data.scans]);

  const candidates = useMemo(() => {
    if (aPlayers.length === 0) return [];
    const aById = new Map(aPlayers.map((p) => [p.governorId, p] as const));
    const threshold = thresholdM * 1_000_000;
    return data.latestPlayers
      .map((b) => {
        const a = aById.get(b.governorId);
        if (!a) return null;
        const delta = b.power - a.power;
        if (delta < threshold) return null;
        if (data.zeroListIds.has(b.governorId)) return null;
        const decision = data.decisionsByGov.get(b.governorId);
        return { player: b, deltaPower: delta, powerA: a.power, decision };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.deltaPower - a.deltaPower);
  }, [aPlayers, data, thresholdM]);

  return (
    <Card
      icon={<ArrowUp size={14} className="text-orange-400" />}
      title="Power growers"
      subtitle="People whose power went UP between two scans. Means they're farming, being fed by allies, or building. If they shouldn't be in K23, growing power is a red flag — they're getting comfortable."
      count={candidates.length}
      explainer={
        <>
          <p>The two scans being compared are: today&apos;s latest scan (newest available) vs. the older one you pick in the <strong>vs:</strong> dropdown. Δ is the difference. The threshold filters out small everyday gains — bump it up to see only big movers.</p>
          <p>Already on the Zero List? They&apos;re excluded automatically. Already approved (<em>Yes</em> on the migrant sheet)? Filtered too — you don&apos;t want to zero approved migrants.</p>
        </>
      }
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <DatePresetPicker
            scans={sameKindScans}
            scanKey={aKey}
            onChange={setAKey}
            excludeKey={`${data.latest!.kind}:${data.latest!.id}`}
            label="vs:"
          />
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Δ ≥</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={thresholdM}
              onChange={(e) => setThresholdM(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 px-2 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-mono focus:outline-none"
            />
            <span className="text-xs text-[var(--text-muted)]">M</span>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">Loading…</div>
      ) : (
        <CandidateTable
          rows={candidates.map((c) => ({
            governorId: c.player.governorId,
            name: c.player.name,
            power: c.player.power,
            alliance: c.player.alliance,
            x: c.player.x,
            y: c.player.y,
            extra: { label: 'Δ Power', value: fmtDelta(c.deltaPower), tone: 'orange' as const },
            decision: c.decision,
            inCycle: data.cycleActiveIds.has(c.player.governorId),
          }))}
          isAdmin={isAdmin}
          actorName={actorName}
          reasonPrefix="Δ power growth"
          onChange={onChange}
        />
      )}
    </Card>
  );
}

// ─── Card 2: Illegal immigrants ──────────────────────────────────────────────

function IllegalArrivalsCard({ data, isAdmin, actorName, onChange }: { data: SharedData; isAdmin: boolean; actorName: string | null; onChange: () => Promise<void> | void }) {
  // "New arrival" = in latest scan AND has NEVER appeared in any scan source
  // (kingdom_scans, seeds_kd, location_scans) older than `daysAgo`.
  // Pulling from all three sources gives enough history to reliably tell who
  // is actually new — auto-scrape alone usually only has a handful of days.
  const [daysAgo, setDaysAgo] = useState<number>(7);
  const [unionIds, setUnionIds] = useState<Set<number>>(new Set());
  const [historySources, setHistorySources] = useState<{ name: string; rows: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      const cutoffIso = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      const { ids, sources } = await loadHistoricalGovIds(cutoffIso);
      setUnionIds(ids);
      setHistorySources(sources);
      setLoading(false);
    })();
  }, [daysAgo]);

  const candidates = useMemo(() => {
    if (unionIds.size === 0) return [];
    return data.latestPlayers
      // 1) Has never appeared in any K23 scan source older than the cutoff
      .filter((b) => !unionIds.has(b.governorId))
      // 2) Not already on the Zero List
      .filter((b) => !data.zeroListIds.has(b.governorId))
      // 3) Not currently in a K23 alliance — players in any alliance were
      //    accepted by alliance leadership, so they're not "illegal" even if
      //    our scan history is limited. Treats empty / noally as suspect.
      .filter((b) => {
        const a = (b.alliance ?? '').trim().toLowerCase();
        return !a || a === 'noally';
      })
      .map((b) => ({ player: b, decision: data.decisionsByGov.get(b.governorId) }))
      // 4) Not Yes-approved on the migrant sheet
      .filter((c) => c.decision?.decision !== 'yes')
      .sort((a, b) => b.player.power - a.player.power);
  }, [unionIds, data]);

  return (
    <Card
      icon={<UserPlus size={14} className="text-cyan-400" />}
      title="Illegal arrivals"
      subtitle={`People in today's scan who joined K23 in the last ${daysAgo} day${daysAgo === 1 ? '' : 's'}, aren't in any K23 alliance, and aren't Yes-approved on the migrant sheet.`}
      count={loading ? 0 : candidates.length}
      explainer={
        <>
          <p>
            A player is flagged if <strong>all four</strong> are true:
          </p>
          <ol className="list-decimal pl-5 space-y-0.5 text-[var(--text-secondary)]">
            <li>In today&apos;s latest scan (so they&apos;re here right now).</li>
            <li>Has never been seen in any historical scan source older than the cutoff. We pool gov_ids from kingdom_scans, seeds_kd, and location_scans for the union.
              {historySources.length > 0 && <> ({historySources.map((s) => `${s.name}: ${s.rows.toLocaleString()} rows`).join(' · ')}.)</>}
            </li>
            <li>Not currently in a K23 alliance (alliance is <code className="text-[var(--text-secondary)]">noally</code> or empty). Anyone accepted into ANG/MNG/etc. is by definition not illegal — alliance leaders approved them.</li>
            <li>Not Yes-approved on the migrant sheet.</li>
          </ol>
          <p className="text-[var(--text-muted)]">
            <strong>Why all four?</strong> Without the alliance check, players whose alliance prefix appears in their name (like <em>ᵃⁿᵍMorven</em>) showed up as illegal whenever our scan history happened to miss them. The alliance signal is the strongest &quot;definitely belongs&quot; check we have.
          </p>
          <p className="text-[var(--text-muted)]">
            Caveats: the auto-scrape covers only the top ~400 by power. Players who fluctuate around that boundary may briefly show up here if they also drop their alliance. False positives are uncommon but possible — verify by checking if you recognize the name from active alliance work.
          </p>
        </>
      }
      controls={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider mr-1">arrived since:</span>
          {[
            { id: 1, label: 'Yesterday' },
            { id: 3, label: '3 days' },
            { id: 7, label: '1 week' },
            { id: 14, label: '2 weeks' },
            { id: 30, label: '1 month' },
            { id: 60, label: '2 months' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setDaysAgo(p.id)}
              className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                daysAgo === p.id
                  ? 'bg-[#4318ff] border-[#4318ff] text-white'
                  : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">Loading…</div>
      ) : (
        <CandidateTable
          rows={candidates.map((c) => ({
            governorId: c.player.governorId,
            name: c.player.name,
            power: c.player.power,
            alliance: c.player.alliance,
            x: c.player.x,
            y: c.player.y,
            extra: null,
            decision: c.decision,
            inCycle: data.cycleActiveIds.has(c.player.governorId),
          }))}
          isAdmin={isAdmin}
          actorName={actorName}
          reasonPrefix="illegal arrival"
          onChange={onChange}
        />
      )}
    </Card>
  );
}

// ─── Card 3: Didn't emigrate (cycle leftovers) ───────────────────────────────

function CycleLeftoversCard({ data, isAdmin, actorName, onChange }: { data: SharedData; isAdmin: boolean; actorName: string | null; onChange: () => Promise<void> | void }) {
  const playerByGov = useMemo(() => {
    const m = new Map<number, UnifiedScanPlayer>();
    for (const p of data.latestPlayers) m.set(p.governorId, p);
    return m;
  }, [data.latestPlayers]);

  const candidates = useMemo(() => {
    return data.cycleLeftovers
      .map((l) => {
        const sp = playerByGov.get(l.characterId);
        return {
          governorId: l.characterId,
          name: l.username,
          // Prefer fresh power from latest scan if we have it
          power: sp?.power ?? l.powerAtOpen,
          alliance: sp?.alliance ?? null,
          x: sp?.x ?? null,
          y: sp?.y ?? null,
          stillInKingdom: !!sp,
          cycleName: l.cycleName,
          cycleDeadline: l.cycleDeadline,
          state: l.state,
          decision: data.decisionsByGov.get(l.characterId),
        };
      })
      // Only surface those still in the kingdom — if they left, we already won
      .filter((c) => c.stillInKingdom)
      .sort((a, b) => b.power - a.power);
  }, [data.cycleLeftovers, playerByGov, data.decisionsByGov]);

  return (
    <Card
      icon={<Users size={14} className="text-rose-400" />}
      title="Didn't emigrate"
      subtitle="People we put on a Cycle (formal emigration round), the cycle deadline passed, but they never left. AND they're still in the kingdom right now. We told them to leave; they didn't. Time to zero."
      count={candidates.length}
      explainer={
        <>
          <p>Pulled from past Cycles where: the deadline has passed, the case never reached a terminal state (still <em>Notified / Claimed / Contacted / To Zero</em>), and the player&apos;s Gov ID is still in the latest scan.</p>
          <p>If a person here is also already on the Zero List, they&apos;re hidden — the badge in the &quot;extra&quot; column shows which cycle they were in and what their last cycle state was, so officers know they&apos;ve already been through the formal process.</p>
        </>
      }
    >
      <CandidateTable
        rows={candidates.map((c) => ({
          governorId: c.governorId,
          name: c.name,
          power: c.power,
          alliance: c.alliance,
          x: c.x,
          y: c.y,
          extra: { label: c.cycleName, value: c.state.replace(/_/g, ' '), tone: 'rose' as const },
          decision: c.decision,
          inCycle: true, // they ARE in a cycle by definition
        }))}
        isAdmin={isAdmin}
        actorName={actorName}
        reasonPrefix="missed cycle deadline"
        onChange={onChange}
      />
    </Card>
  );
}

// ─── Card 4: Top N to evaluate ───────────────────────────────────────────────

function TopNCard({ data, isAdmin, actorName, onChange }: { data: SharedData; isAdmin: boolean; actorName: string | null; onChange: () => Promise<void> | void }) {
  const [topN, setTopN] = useState<number>(400);

  const candidates = useMemo(() => {
    const sorted = [...data.latestPlayers].sort((a, b) => b.power - a.power).slice(0, topN);
    return sorted
      .filter((p) => !data.zeroListIds.has(p.governorId))
      .filter((p) => !data.cycleActiveIds.has(p.governorId))
      .map((p) => ({ player: p, decision: data.decisionsByGov.get(p.governorId) }))
      // Filter out approved migrants — they're allowed
      .filter((c) => c.decision?.decision !== 'yes');
  }, [data, topN]);

  return (
    <Card
      icon={<Trophy size={14} className="text-amber-400" />}
      title="Top players to evaluate"
      subtitle="Top-N power players in K23 who haven't been dealt with yet. Already on the Zero List? Hidden. In an active cycle? Hidden. Approved on the migrant sheet (Yes)? Hidden. So what's left is your &quot;haven't decided&quot; bucket."
      count={candidates.length}
      explainer={
        <>
          <p>Walk through this list and decide for each person: should they stay or should they go? If they should go, check the box and add to Zero List.</p>
          <p>Power members at the top are the ones you most need to be sure about — losing them is the biggest hit if it&apos;s the wrong call, but keeping them illegally is the biggest problem if they shouldn&apos;t be here.</p>
          <p>Default top-N is 400 (the K23 active-roster size). Bump it up if you also want to evaluate the long tail.</p>
        </>
      }
      controls={
        <>
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Top:</label>
          <input
            type="number"
            min={1}
            max={2000}
            value={topN}
            onChange={(e) => setTopN(Math.max(1, Math.min(2000, Number(e.target.value) || 400)))}
            className="w-16 px-2 py-1 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-mono focus:outline-none"
          />
        </>
      }
    >
      <CandidateTable
        rows={candidates.map((c) => ({
          governorId: c.player.governorId,
          name: c.player.name,
          power: c.player.power,
          alliance: c.player.alliance,
          x: c.player.x,
          y: c.player.y,
          extra: null,
          decision: c.decision,
          inCycle: false,
        }))}
        isAdmin={isAdmin}
        actorName={actorName}
        reasonPrefix={`top-${topN} review`}
        onChange={onChange}
      />
    </Card>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Card({
  icon,
  title,
  subtitle,
  count,
  controls,
  explainer,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  controls?: React.ReactNode;
  explainer?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Cards default closed — the count badge tells you the workload at a glance,
  // so click to expand only when you actually want to act on it.
  const [open, setOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  return (
    <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--background-hover)] transition-colors"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--background-secondary)] flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</div>
        </div>
        <span className="text-2xl font-semibold text-[var(--foreground)] tabular-nums">{count}</span>
        <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform mt-2 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">
          {controls && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[var(--background-secondary)]/40">
              {controls}
              {explainer && (
                <button
                  onClick={() => setExplainOpen((o) => !o)}
                  className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] underline-offset-2 hover:underline"
                >
                  {explainOpen ? 'hide details' : 'how does this work?'}
                </button>
              )}
            </div>
          )}
          {!controls && explainer && (
            <div className="flex justify-end px-4 py-2 bg-[var(--background-secondary)]/40">
              <button
                onClick={() => setExplainOpen((o) => !o)}
                className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] underline-offset-2 hover:underline"
              >
                {explainOpen ? 'hide details' : 'how does this work?'}
              </button>
            </div>
          )}
          {explainOpen && explainer && (
            <div className="px-4 py-3 bg-violet-500/5 border-y border-violet-500/20 text-xs text-[var(--text-secondary)] space-y-2">
              {explainer}
            </div>
          )}
          {children}
        </div>
      )}
    </section>
  );
}

interface CandidateRow {
  governorId: number;
  name: string;
  power: number;
  alliance: string | null;
  x: number | null;
  y: number | null;
  extra: { label: string; value: string; tone: 'orange' | 'rose' | 'amber' | 'cyan' } | null;
  decision: MigrantDecision | undefined;
  inCycle: boolean;
}

function CandidateTable({ rows, isAdmin, actorName, reasonPrefix, onChange }: {
  rows: CandidateRow[];
  isAdmin: boolean;
  actorName: string | null;
  reasonPrefix: string;
  onChange: () => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.governorId)));
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    const chosen = rows.filter((r) => selected.has(r.governorId));
    if (!confirm(`Add ${chosen.length} player${chosen.length === 1 ? '' : 's'} to the Zero List?`)) return;
    setBusy(true);
    try {
      await bulkAddToZeroList(
        chosen.map((c) => ({
          characterId: c.governorId,
          username: c.name,
          power: c.power,
          x: c.x,
          y: c.y,
          alliance: c.alliance,
          lastSeenScanId: null,
          addedBy: actorName ?? 'admin',
          reason: reasonPrefix + (c.decision ? ` (decision: ${c.decision.decisionRaw || c.decision.decision})` : ''),
        })),
      );
      setSelected(new Set());
      await onChange();
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">No candidates 🎉</div>;
  }

  return (
    <div>
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-orange-500/10 border-b border-orange-500/30">
          <span className="text-xs text-orange-300">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">Clear</button>
            <button disabled={busy} onClick={addSelected} className="px-2 py-1 text-[11px] rounded bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 disabled:opacity-60">
              {busy ? 'Adding…' : 'Add to Zero List'}
            </button>
          </div>
        </div>
      )}
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--background-secondary)] text-[var(--text-muted)] uppercase tracking-wider">
            <tr>
              {isAdmin && (
                <th className="px-3 py-2 text-left w-8">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleAll} />
                </th>
              )}
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">Power</th>
              {rows.some((r) => r.extra !== null) && <th className="px-3 py-2 text-right">{rows.find((r) => r.extra)?.extra?.label}</th>}
              <th className="px-3 py-2 text-left">Alliance</th>
              <th className="px-3 py-2 text-left">Decision</th>
              <th className="px-3 py-2 text-left">Coords</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.governorId} className="border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors">
                {isAdmin && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.governorId)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(r.governorId)) next.delete(r.governorId); else next.add(r.governorId);
                        setSelected(next);
                      }}
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="text-[var(--foreground)]">{r.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">{r.governorId}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM(r.power)}</td>
                {rows.some((row) => row.extra !== null) && (
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${r.extra ? toneClass(r.extra.tone) : ''}`}>
                    {r.extra?.value ?? '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-[var(--text-secondary)]">{r.alliance || '—'}</td>
                <td className="px-3 py-2">
                  {r.decision ? <DecisionBadge d={r.decision.decision} raw={r.decision.decisionRaw} /> : <span className="text-[var(--text-muted)]">—</span>}
                  {r.inCycle && <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] bg-rose-500/15 text-rose-400 border border-rose-500/30">in cycle</span>}
                </td>
                <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{r.x != null && r.y != null ? `(${r.x}, ${r.y})` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function toneClass(tone: 'orange' | 'rose' | 'amber' | 'cyan'): string {
  return {
    orange: 'text-orange-400',
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    cyan: 'text-cyan-400',
  }[tone];
}

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
