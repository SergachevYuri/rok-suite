'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  Flag,
  Lock,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { WarRoomAuthProvider, useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import { loadLatestDataset, loadConfigRow, MIGRATION_ROW_ID, parseStatsFile, type Player } from '../data';
import {
  type MigrationCase,
  type MigrationCycle,
  type MigrationState,
  TERMINAL_STATES,
  listCycles,
  createCycle,
  closeCycle,
  deleteCycle as deleteCycleRow,
  updateCycle,
  listCases,
  bulkCreateCases,
  addCase,
  deleteCase,
  claimCase,
  unclaimCase,
  markContacted,
  markAcknowledged,
  suggestMigrated,
  confirmMigrated,
  markException,
  confirmZeroed,
  resetCaseToPending,
  updateCaseNotes,
  subscribeToCycles,
  subscribeToCases,
} from '@/lib/supabase/use-migration-cases';

const STATE_LABELS: Record<MigrationState, string> = {
  pending: 'Pending',
  claimed: 'Claimed',
  contacted: 'Contacted',
  acknowledged: 'Acknowledged',
  migrated: 'Migrated',
  excepted: 'Excepted',
  zeroed: 'Zeroed',
};

const STATE_STYLES: Record<MigrationState, string> = {
  pending: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  claimed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contacted: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  acknowledged: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  migrated: 'bg-green-500/15 text-green-400 border-green-500/30',
  excepted: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  zeroed: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const ZERO_POWER_DROP = 0.15;

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtM(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : fmt(n);
}
function formatDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function toUTCDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function parseUTCDatetimeLocal(s: string) {
  return new Date(`${s}:00Z`);
}

export default function MigrationPage() {
  return (
    <AppSidebar>
      <WarRoomAuthProvider>
        <MigrationPageInner />
      </WarRoomAuthProvider>
    </AppSidebar>
  );
}

function MigrationPageInner() {
  const { isAtLeast, officerName } = useWarRoomAuth();
  const isOfficer = isAtLeast('officer');
  const isAdmin = isAtLeast('admin');

  const [cycles, setCycles] = useState<MigrationCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [cases, setCases] = useState<MigrationCase[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [flaggedIds, setFlaggedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<MigrationState | 'all' | 'active'>('active');
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [showEditCycle, setShowEditCycle] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  // Instructions panel — collapsed state persists per browser.
  const [guideOpen, setGuideOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('migration-guide-collapsed') !== '1';
  });
  const toggleGuide = () => {
    setGuideOpen((o) => {
      const next = !o;
      try { window.localStorage.setItem('migration-guide-collapsed', next ? '0' : '1'); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Load cycles + latest dataset + flagged list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cyclesData, dataset, flagged] = await Promise.all([
          listCycles(),
          loadLatestDataset(),
          loadConfigRow<number[]>(MIGRATION_ROW_ID),
        ]);
        if (cancelled) return;
        setCycles(cyclesData);
        setPlayers(dataset?.players ?? []);
        setFlaggedIds(flagged ?? []);
        // Pick newest-open cycle, or newest of any, or null
        const open = cyclesData.find((c) => !c.closed_at);
        setSelectedCycleId((prev) => prev ?? open?.id ?? cyclesData[0]?.id ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const unsub = subscribeToCycles(async () => {
      const fresh = await listCycles();
      setCycles(fresh);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Load cases for the selected cycle + subscribe
  useEffect(() => {
    if (!selectedCycleId) {
      setCases([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await listCases(selectedCycleId);
      if (!cancelled) setCases(data);
    })();
    const unsub = subscribeToCases(selectedCycleId, async () => {
      const fresh = await listCases(selectedCycleId);
      setCases(fresh);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [selectedCycleId]);

  const selectedCycle = useMemo(() => cycles.find((c) => c.id === selectedCycleId) ?? null, [cycles, selectedCycleId]);

  const deadlineMs = selectedCycle ? new Date(selectedCycle.deadline).getTime() : 0;
  const pastDeadline = !!selectedCycle && now.getTime() > deadlineMs;
  const hoursToDeadline = selectedCycle ? (deadlineMs - now.getTime()) / 3_600_000 : 0;

  // Derived state
  const counts = useMemo(() => {
    const c: Record<MigrationState, number> = {
      pending: 0, claimed: 0, contacted: 0, acknowledged: 0, migrated: 0, excepted: 0, zeroed: 0,
    };
    for (const k of cases) c[k.state]++;
    return c;
  }, [cases]);

  const activeCases = useMemo(
    () => cases.filter((c) => !TERMINAL_STATES.includes(c.state)),
    [cases],
  );

  const atRisk = useMemo(
    () => (pastDeadline ? activeCases : []),
    [pastDeadline, activeCases],
  );

  const filteredCases = useMemo(() => {
    let list = cases;
    if (stateFilter === 'active') list = list.filter((c) => !TERMINAL_STATES.includes(c.state));
    else if (stateFilter !== 'all') list = list.filter((c) => c.state === stateFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(
        (c) =>
          c.username.toLowerCase().includes(q) || (qDigits.length >= 3 && String(c.character_id).includes(qDigits)),
      );
    }
    return list;
  }, [cases, search, stateFilter]);

  // Power math — scoped to the current cycle
  const powerImpact = useMemo(() => {
    const totalKingdom = players.reduce((s, p) => s + (p.power ?? 0), 0);
    const activePower = activeCases.reduce((s, c) => s + c.power_at_open, 0);
    const afterMigrate = totalKingdom - activePower;
    const zeroLoss = activePower * ZERO_POWER_DROP;
    const afterZero = totalKingdom - zeroLoss;
    return { totalKingdom, activePower, afterMigrate, zeroLoss, afterZero };
  }, [players, activeCases]);

  const refreshFlagged = useCallback(async () => {
    const flagged = await loadConfigRow<number[]>(MIGRATION_ROW_ID);
    setFlaggedIds(flagged ?? []);
  }, []);

  // Handlers

  const handleCreateCycle = async (name: string, deadlineISO: string, snapshot: boolean) => {
    if (!officerName) {
      alert('Please set your officer name first via the Sign In dialog.');
      return;
    }
    const cycle = await createCycle({ name, deadline: deadlineISO, createdBy: officerName });
    if (snapshot) {
      const flaggedSet = new Set(flaggedIds);
      const entries = players
        .filter((p) => flaggedSet.has(p.characterId))
        .map((p) => ({ characterId: p.characterId, username: p.username, power: p.power }));
      if (entries.length > 0) await bulkCreateCases(cycle.id, entries);
    }
    const fresh = await listCycles();
    setCycles(fresh);
    setSelectedCycleId(cycle.id);
    setShowNewCycle(false);
  };

  const handleCloseCycle = async () => {
    if (!selectedCycle) return;
    if (!confirm(`Close cycle "${selectedCycle.name}"? No further cases will be opened automatically.`)) return;
    await closeCycle(selectedCycle.id);
  };

  const handleDeleteCycle = async () => {
    if (!selectedCycle) return;
    if (!confirm(`Delete cycle "${selectedCycle.name}" and all of its cases? This cannot be undone.`)) return;
    await deleteCycleRow(selectedCycle.id);
    setSelectedCycleId(null);
  };

  const handleAddFlaggedToCycle = async () => {
    if (!selectedCycle) return;
    const existing = new Set(cases.map((c) => c.character_id));
    const flaggedSet = new Set(flaggedIds);
    const additions = players
      .filter((p) => flaggedSet.has(p.characterId) && !existing.has(p.characterId))
      .map((p) => ({ characterId: p.characterId, username: p.username, power: p.power }));
    if (additions.length === 0) {
      alert('No new flagged players to add — all current flags are already cases in this cycle.');
      return;
    }
    await bulkCreateCases(selectedCycle.id, additions);
  };

  const handleRefreshFlagged = useCallback(() => { void refreshFlagged(); }, [refreshFlagged]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--text-muted)]">Loading…</div>
    );
  }

  if (!isOfficer) {
    return (
      <div className="min-h-screen">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-10">
          <Link href="/dkp" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] mb-6">
            <ArrowLeft size={14} /> Back to DKP
          </Link>
          <div className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-8 text-center">
            <Lock className="mx-auto text-[var(--text-muted)] mb-3" />
            <h1 className="text-lg font-semibold text-[var(--foreground)] mb-2">Migration tracking is officer-only</h1>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Sign in on the DKP page to access migration case management.
            </p>
            <Link href="/dkp" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] transition-colors">
              Go to DKP page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Link href="/dkp" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] mb-2">
              <ArrowLeft size={12} /> Back to DKP
            </Link>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Migration Cases</h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Track players flagged for migration through claim → contact → outcome.
            </p>
          </div>
          <SessionBadge />
        </header>

        {/* Cycle bar */}
        <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Cycle:</label>
          {cycles.length === 0 ? (
            <span className="text-sm text-[var(--text-muted)]">No cycles yet.</span>
          ) : (
            <select
              value={selectedCycleId ?? ''}
              onChange={(e) => setSelectedCycleId(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.closed_at ? '(closed)' : ''} — deadline {new Date(c.deadline).toLocaleString(undefined, { month: 'short', day: 'numeric' })}
                </option>
              ))}
            </select>
          )}
          {selectedCycle && (
            <>
              <span className={`text-xs px-2 py-1 rounded ${pastDeadline ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'bg-[var(--background-secondary)] text-[var(--text-secondary)]'}`}>
                {selectedCycle.closed_at
                  ? 'Closed'
                  : pastDeadline
                    ? `Deadline passed · ${Math.abs(Math.round(hoursToDeadline))}h ago`
                    : `${Math.max(0, Math.round(hoursToDeadline))}h to deadline`}
              </span>
            </>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectedCycle && !selectedCycle.closed_at && (
              <button
                onClick={handleAddFlaggedToCycle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                title="Add currently flagged DKP players to this cycle (skips duplicates)"
              >
                <Flag size={12} /> Add current flags
              </button>
            )}
            <button
              onClick={handleRefreshFlagged}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
              title="Refresh flagged-player list from DKP"
            >
              <RotateCcw size={14} />
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowNewCycle(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4318ff] text-white text-xs font-medium hover:bg-[#3a14e0] transition-colors"
                >
                  <Plus size={12} /> New cycle
                </button>
                {selectedCycle && (
                  <button
                    onClick={() => setShowEditCycle(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                    title="Edit cycle name or deadline"
                  >
                    Edit
                  </button>
                )}
                {selectedCycle && !selectedCycle.closed_at && (
                  <button
                    onClick={handleCloseCycle}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                  >
                    Close cycle
                  </button>
                )}
                {selectedCycle && (
                  <button
                    onClick={handleDeleteCycle}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors"
                    title="Delete this cycle and all its cases"
                  >
                    <X size={12} /> Delete
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* How this works */}
        <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] overflow-hidden">
          <button
            onClick={toggleGuide}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--background-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">How this works</span>
              {!guideOpen && <span className="text-[11px] text-[var(--text-muted)]">click to expand</span>}
            </div>
            <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
          </button>
          {guideOpen && (
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] text-sm text-[var(--text-secondary)] space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Goal: track everyone flagged on the DKP page from the moment we decide they need to migrate, through contact and outcome, with a record of who's been zeroed or excepted and why.
              </p>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Workflow</div>
                <ol className="space-y-1.5 text-xs list-decimal pl-5">
                  <li><strong>Admin creates a cycle</strong> at the start of a migration round (e.g. "April 2026"), sets a UTC deadline, and snapshots the currently flagged players into it.</li>
                  <li><strong>Officer claims a case</strong> — click "Claim" on a pending row. This is your commitment to message that player. Claimed cases show your name so others don't duplicate work.</li>
                  <li><strong>Mark contacted</strong> once you've DM'd them. Mark <strong>Acknowledged</strong> once they've replied.</li>
                  <li><strong>Mark Migrated</strong> if they leave the kingdom. Can be done at any state.</li>
                  <li><strong>Admin grants an Exception</strong> (with a required reason) if a player has a legitimate excuse. Exceptions can be granted any time before the deadline.</li>
                  <li><strong>After the deadline</strong> — any case still not migrated/excepted shows as at-risk. Officers confirm <strong>Zeroed</strong> once the zeroing actually happens in-game.</li>
                </ol>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">State meanings</div>
                <ul className="text-xs space-y-1">
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]">Pending</span> nobody claimed yet</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-blue-500/15 text-blue-400 border-blue-500/30">Claimed</span> an officer is handling the contact</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-sky-500/15 text-sky-400 border-sky-500/30">Contacted</span> message sent</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-violet-500/15 text-violet-400 border-violet-500/30">Acknowledged</span> player responded</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-green-500/15 text-green-400 border-green-500/30">Migrated</span> player left the kingdom</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/30">Excepted</span> admin granted a pass (with a reason)</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-rose-500/15 text-rose-400 border-rose-500/30">Zeroed</span> deadline hit, player was zeroed</li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Good to know</div>
                <ul className="text-xs space-y-1 list-disc pl-5">
                  <li><strong>Scan delta</strong> — upload a fresh stats XLSX and players missing from it are suggested as migrated. You still have to click Migrated to confirm, but this saves auditing one by one.</li>
                  <li><strong>Add current flags</strong> — if officers flag more people on the DKP page mid-cycle, click this button in the cycle bar to pull the new flags in. Duplicates are skipped.</li>
                  <li><strong>Notes</strong> — every case has a shared notes field; use it for context other officers should see ("they said they'd move on Friday", "alt account", etc.).</li>
                  <li><strong>Admin-only actions</strong> — creating/editing/closing/deleting cycles, and granting exceptions. Everything else is officer.</li>
                </ul>
              </div>
            </div>
          )}
        </section>

        {!selectedCycle ? (
          <div className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
            {isAdmin ? 'Create a cycle to start tracking migration cases.' : 'No cycle selected. Ask an admin to create one.'}
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <section className="mb-4 grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-3">
              {(['pending', 'claimed', 'contacted', 'acknowledged', 'migrated', 'excepted', 'zeroed'] as MigrationState[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStateFilter(s)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${STATE_STYLES[s]} ${stateFilter === s ? 'ring-2 ring-offset-0 ring-[var(--foreground)]/20' : 'hover:opacity-80'}`}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-80">{STATE_LABELS[s]}</div>
                  <div className="text-xl font-bold tabular-nums">{counts[s]}</div>
                </button>
              ))}
            </section>

            {/* Power impact */}
            <section className="mb-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Power Impact (active cases)</h2>
                <span className="text-xs text-[var(--text-muted)] tabular-nums">
                  {activeCases.length} active · {fmtM(powerImpact.activePower)} power
                  {powerImpact.totalKingdom > 0 && (
                    <> ({((powerImpact.activePower / powerImpact.totalKingdom) * 100).toFixed(1)}% of kingdom)</>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Kingdom Power</div>
                  <div className="text-xl font-bold tabular-nums text-[var(--foreground)]">{fmtM(powerImpact.totalKingdom)}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">From latest DKP scan</div>
                </div>
                <div className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-3">
                  <div className="text-xs text-rose-400 uppercase tracking-wider mb-1">If Active Cases Migrate</div>
                  <div className="text-xl font-bold tabular-nums text-rose-400">{fmtM(powerImpact.afterMigrate)}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    −{fmtM(powerImpact.activePower)}
                    {powerImpact.totalKingdom > 0 && <> ({((powerImpact.activePower / powerImpact.totalKingdom) * 100).toFixed(1)}% loss)</>}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                  <div className="text-xs text-amber-400 uppercase tracking-wider mb-1">If Zeroed ({Math.round(ZERO_POWER_DROP * 100)}%)</div>
                  <div className="text-xl font-bold tabular-nums text-amber-400">{fmtM(powerImpact.afterZero)}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    −{fmtM(powerImpact.zeroLoss)}
                    {powerImpact.totalKingdom > 0 && <> ({((powerImpact.zeroLoss / powerImpact.totalKingdom) * 100).toFixed(2)}% loss)</>}
                  </div>
                </div>
              </div>
            </section>

            {/* At-risk banner */}
            {atRisk.length > 0 && (
              <section className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-300">
                <strong>{atRisk.length}</strong> case{atRisk.length === 1 ? '' : 's'} past the deadline and not yet resolved.
              </section>
            )}

            {/* Scan delta uploader */}
            <ScanDeltaPanel cases={cases} cycleId={selectedCycle.id} />

            {/* Controls */}
            <section className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or gov ID"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
                />
              </div>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
                className="px-3 py-2 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              >
                <option value="active">Active (non-terminal)</option>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="claimed">Claimed</option>
                <option value="contacted">Contacted</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="migrated">Migrated</option>
                <option value="excepted">Excepted</option>
                <option value="zeroed">Zeroed</option>
              </select>
              <span className="text-xs text-[var(--text-muted)] ml-auto">{filteredCases.length} shown · {cases.length} total</span>
            </section>

            {/* Cases table */}
            <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
              <div className="overflow-auto max-h-[calc(100vh-240px)] rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Player</th>
                      <th className="px-3 py-2 text-right">Power</th>
                      <th className="px-3 py-2 text-left">State</th>
                      <th className="px-3 py-2 text-left">Claimed by</th>
                      <th className="px-3 py-2 text-left">Last action</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((c) => (
                      <CaseRow
                        key={c.id}
                        caseRow={c}
                        officerName={officerName}
                        isAdmin={isAdmin}
                        pastDeadline={pastDeadline}
                      />
                    ))}
                    {filteredCases.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                          No cases match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {showNewCycle && (
          <NewCycleDialog
            defaultFlaggedCount={flaggedIds.length}
            onClose={() => setShowNewCycle(false)}
            onCreate={handleCreateCycle}
          />
        )}
        {showEditCycle && selectedCycle && (
          <EditCycleDialog
            cycle={selectedCycle}
            onClose={() => setShowEditCycle(false)}
            onSave={async (name, deadlineISO, notes) => {
              await updateCycle(selectedCycle.id, { name, deadline: deadlineISO, notes });
              setShowEditCycle(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ——— Sign-in badge (matches DKP's pattern but scoped here) ———

function SessionBadge() {
  const { isAtLeast, role, login, logout, officerName, setOfficerName } = useWarRoomAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState(officerName ?? '');
  const [error, setError] = useState<string | null>(null);

  if (isAtLeast('officer')) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Lock size={12} /> {role.toUpperCase()}
          {officerName && <> • {officerName}</>}
        </span>
        <button onClick={logout} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors" title="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
      >
        <Lock size={12} /> Sign in
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Sign in</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]"><X size={16} /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const ok = login(password);
                if (!ok) { setError('Incorrect password'); return; }
                if (name.trim()) setOfficerName(name.trim());
                setPassword('');
                setError(null);
                setOpen(false);
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs text-[var(--text-muted)]">Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30" />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" className="w-full px-3 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] transition-colors">Submit</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ——— Cycle creation dialog ———

function EditCycleDialog({
  cycle,
  onClose,
  onSave,
}: {
  cycle: MigrationCycle;
  onClose: () => void;
  onSave: (name: string, deadlineISO: string, notes: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(cycle.name);
  const [deadlineStr, setDeadlineStr] = useState(() => toUTCDatetimeLocal(new Date(cycle.deadline)));
  const [notes, setNotes] = useState(cycle.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Edit cycle</h3>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]"><X size={16} /></button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const deadline = parseUTCDatetimeLocal(deadlineStr).toISOString();
              await onSave(name.trim(), deadline, notes.trim() || null);
            } catch (x) {
              setErr(x instanceof Error ? x.message : 'Failed to save');
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-xs text-[var(--text-muted)]">Cycle name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">Deadline (UTC)</label>
            <input type="datetime-local" value={deadlineStr} onChange={(e) => setDeadlineStr(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-mono text-[var(--foreground)] [color-scheme:dark] focus:outline-none focus:border-[var(--foreground)]/30" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30" />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button disabled={busy} type="submit" className="w-full px-3 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-60 transition-colors">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

function NewCycleDialog({
  defaultFlaggedCount,
  onClose,
  onCreate,
}: {
  defaultFlaggedCount: number;
  onClose: () => void;
  onCreate: (name: string, deadlineISO: string, snapshot: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(() => {
    const d = new Date();
    return `${d.toLocaleString(undefined, { month: 'long', year: 'numeric' })} cycle`;
  });
  const [deadlineStr, setDeadlineStr] = useState(() => toUTCDatetimeLocal(new Date(Date.now() + 7 * 24 * 3_600_000)));
  const [snapshot, setSnapshot] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">New migration cycle</h3>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]"><X size={16} /></button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const deadline = parseUTCDatetimeLocal(deadlineStr).toISOString();
              await onCreate(name.trim(), deadline, snapshot);
            } catch (x) {
              setErr(x instanceof Error ? x.message : 'Failed to create cycle');
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-xs text-[var(--text-muted)]">Cycle name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">Deadline (UTC)</label>
            <input type="datetime-local" value={deadlineStr} onChange={(e) => setDeadlineStr(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-mono text-[var(--foreground)] [color-scheme:dark] focus:outline-none focus:border-[var(--foreground)]/30" />
          </div>
          <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={snapshot} onChange={(e) => setSnapshot(e.target.checked)} className="mt-0.5 accent-[#4318ff]" />
            <span>
              Snapshot the currently flagged DKP players ({defaultFlaggedCount}) as cases.
              <span className="block text-[var(--text-muted)] mt-0.5">Uncheck to start with an empty cycle.</span>
            </span>
          </label>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button disabled={busy} type="submit" className="w-full px-3 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-60 transition-colors">
            {busy ? 'Creating…' : 'Create cycle'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ——— Scan delta uploader ———

function ScanDeltaPanel({ cases, cycleId }: { cases: MigrationCase[]; cycleId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MigrationCase[] | null>(null);

  const activeCaseIds = useMemo(() => new Set(cases.filter((c) => !TERMINAL_STATES.includes(c.state)).map((c) => c.character_id)), [cases]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const rows = await parseStatsFile(file);
      const scanIds = new Set(rows.map((r) => r.governorId));
      const missing = cases.filter((c) => activeCaseIds.has(c.character_id) && !scanIds.has(c.character_id));
      // Mark suggested_at for each so the UI highlights them even if operator navigates away.
      await Promise.all(missing.map((c) => suggestMigrated(c.id)));
      setSuggestions(missing);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan parse failed');
    } finally {
      setBusy(false);
    }
  };

  // Suppress unused-var lint for cycleId (kept for future reuse / scoping).
  void cycleId;

  return (
    <section className="mb-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Scan delta</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Upload a fresh kingdom stats XLSX. Players missing from the scan will be suggested as migrated.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:opacity-60 transition-colors"
        >
          <Upload size={12} /> {busy ? 'Scanning…' : 'Upload scan'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {suggestions && (
        <div className="mt-3 text-xs text-[var(--text-secondary)]">
          {suggestions.length === 0
            ? <span className="text-[var(--text-muted)]">Scan checked — no active cases are missing from the new scan.</span>
            : <>
                <span className="text-amber-400 font-medium">{suggestions.length}</span> active case{suggestions.length === 1 ? '' : 's'} missing from the new scan — marked as suggested-migrated. Confirm each in the table below.
              </>
          }
        </div>
      )}
    </section>
  );
}

// ——— Case row with actions ———

function CaseRow({
  caseRow: c,
  officerName,
  isAdmin,
  pastDeadline,
}: {
  caseRow: MigrationCase;
  officerName: string | null;
  isAdmin: boolean;
  pastDeadline: boolean;
}) {
  const [showException, setShowException] = useState(false);
  const [reason, setReason] = useState(c.exception_reason ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesVal, setNotesVal] = useState(c.notes ?? '');
  const [busy, setBusy] = useState(false);

  const isActive = !TERMINAL_STATES.includes(c.state);
  const suggested = c.migration_suggested_at !== null;

  const lastAction = (() => {
    const entries = [
      { label: 'zeroed', iso: c.zeroed_at },
      { label: 'excepted', iso: c.excepted_at },
      { label: 'migrated', iso: c.migrated_confirmed_at },
      { label: 'suggested', iso: c.migration_suggested_at },
      { label: 'acknowledged', iso: c.acknowledged_at },
      { label: 'contacted', iso: c.contacted_at },
      { label: 'claimed', iso: c.claimed_at },
    ].filter((e) => e.iso);
    return entries[0] ?? null;
  })();

  const wrap = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const ensureOfficer = () => {
    if (!officerName || !officerName.trim()) {
      alert('Please set your officer name first via the Sign In dialog.');
      return false;
    }
    return true;
  };

  return (
    <tr className={`border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors ${pastDeadline && isActive ? 'bg-rose-500/5' : ''}`}>
      <td className="px-3 py-2">
        <div className="text-[var(--foreground)]">{c.username}</div>
        <div className="text-[11px] text-[var(--text-muted)] font-mono">#{c.character_id}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM(c.power_at_open)}</td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATE_STYLES[c.state]}`}>
          {STATE_LABELS[c.state]}
        </span>
        {suggested && isActive && (
          <div className="text-[10px] text-amber-400 mt-1">Suggested migrated from scan</div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
        {c.claimed_by ?? <span className="text-[var(--text-muted)]">—</span>}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
        {lastAction ? <>{lastAction.label} · {formatDateTime(lastAction.iso)}</> : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {c.state === 'pending' && (
            <button disabled={busy} onClick={() => ensureOfficer() && wrap(() => claimCase(c.id, officerName!))} className="px-2 py-1 text-[11px] rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25">Claim</button>
          )}
          {c.state === 'claimed' && (
            <>
              <button disabled={busy} onClick={() => wrap(() => markContacted(c.id))} className="px-2 py-1 text-[11px] rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25">Contacted</button>
              <button disabled={busy} onClick={() => wrap(() => unclaimCase(c.id))} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">Unclaim</button>
            </>
          )}
          {c.state === 'contacted' && (
            <button disabled={busy} onClick={() => wrap(() => markAcknowledged(c.id))} className="px-2 py-1 text-[11px] rounded bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25">Acknowledged</button>
          )}
          {isActive && (
            <button disabled={busy} onClick={() => ensureOfficer() && wrap(() => confirmMigrated(c.id, officerName!))} className="px-2 py-1 text-[11px] rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25">Migrated</button>
          )}
          {isActive && isAdmin && (
            <button disabled={busy} onClick={() => setShowException(true)} className="px-2 py-1 text-[11px] rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25">Exception</button>
          )}
          {isActive && pastDeadline && (
            <button disabled={busy} onClick={() => ensureOfficer() && wrap(() => confirmZeroed(c.id, officerName!))} className="px-2 py-1 text-[11px] rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25">Zeroed</button>
          )}
          {!isActive && (
            <button disabled={busy} onClick={() => wrap(() => resetCaseToPending(c.id))} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">Reset</button>
          )}
          <button onClick={() => setNotesOpen((o) => !o)} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">Notes</button>
          {isAdmin && (
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm(`Remove ${c.username} from this cycle?`)) return;
                void wrap(() => deleteCase(c.id));
              }}
              className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-rose-400"
              title="Remove case"
            >
              <X size={11} />
            </button>
          )}
        </div>
        {notesOpen && (
          <div className="mt-2">
            <textarea
              value={notesVal}
              onChange={(e) => setNotesVal(e.target.value)}
              placeholder="Notes (visible to all officers)…"
              className="w-full px-2 py-1 rounded bg-[var(--background-secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
              rows={2}
            />
            <div className="flex gap-1 mt-1">
              <button onClick={() => wrap(() => updateCaseNotes(c.id, notesVal.trim() || null))} className="px-2 py-1 text-[11px] rounded bg-[#4318ff] text-white">Save</button>
              <button onClick={() => { setNotesOpen(false); setNotesVal(c.notes ?? ''); }} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)]">Cancel</button>
            </div>
          </div>
        )}
        {c.exception_reason && c.state === 'excepted' && (
          <div className="mt-1 text-[11px] text-amber-400 italic">Exception: {c.exception_reason}</div>
        )}
        {c.notes && !notesOpen && (
          <div className="mt-1 text-[11px] text-[var(--text-muted)] italic">{c.notes}</div>
        )}
      </td>
      {showException && (
        <td className="sr-only">
          <ExceptionDialog
            onClose={() => setShowException(false)}
            onConfirm={async (r) => {
              if (!officerName) { alert('Set your admin name via Sign In first.'); return; }
              await markException(c.id, officerName, r);
              setShowException(false);
            }}
            initial={reason}
            setInitial={setReason}
          />
        </td>
      )}
    </tr>
  );
}

function ExceptionDialog({ onClose, onConfirm, initial, setInitial }: { onClose: () => void; onConfirm: (reason: string) => Promise<void>; initial: string; setInitial: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Grant exception</h3>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]"><X size={16} /></button>
        </div>
        <label className="text-xs text-[var(--text-muted)]">Reason</label>
        <textarea value={initial} onChange={(e) => setInitial(e.target.value)} autoFocus rows={4} className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30" placeholder="Why is this player being excepted?" />
        <div className="flex gap-2 mt-4">
          <button
            disabled={busy || !initial.trim()}
            onClick={async () => { setBusy(true); try { await onConfirm(initial.trim()); } finally { setBusy(false); } }}
            className="flex-1 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm font-medium hover:bg-amber-500/30 disabled:opacity-60 transition-colors"
          >
            {busy ? 'Saving…' : 'Confirm exception'}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
