'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
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
import { ZeroListTab } from '@/components/migration/ZeroListTab';
import { ScansTab } from '@/components/migration/ScansTab';
import { CopyablePlayerCell } from '@/components/migration/CopyablePlayerCell';
import { SortableTh, type SortDir } from '@/components/migration/SortableTh';
import { loadLatestDataset, loadConfigRow, MIGRATION_ROW_ID, parseStatsFile, type Player } from '../dkp/data';
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
  markToZero,
  markAfk,
  requestException,
  denyExceptionRequest,
  suggestMigrated,
  dismissMigrationSuggestion,
  confirmMigrated,
  markException,
  updateExceptionReason,
  confirmZeroed,
  resetCaseToPending,
  undoLastStateChange,
  updateCaseNotes,
  subscribeToCycles,
  subscribeToCases,
} from '@/lib/supabase/use-migration-cases';

const STATE_LABELS: Record<MigrationState, string> = {
  pending: 'Notified',
  claimed: 'Notified',
  contacted: 'Notified',
  excepted: 'Excepted',
  migrated: 'Emigrated',
  marked_to_zero: 'To Zero',
  zeroed: 'Zeroed',
  afk: 'AFK',
};

const STATE_STYLES: Record<MigrationState, string> = {
  pending: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  claimed: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  contacted: 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  excepted: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  migrated: 'bg-green-500/15 text-green-400 border-green-500/30',
  marked_to_zero: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  zeroed: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  afk: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

/** Visible states in the summary strip + filter dropdown. claimed/contacted are merged into pending (Notified). */
const STATE_ORDER: MigrationState[] = ['pending', 'excepted', 'migrated', 'afk', 'marked_to_zero', 'zeroed'];

const ZERO_POWER_DROP = 0.15;

type SortField = 'username' | 'power_at_open' | 'state' | 'updated_at';

const DEFAULT_SORT_DIR: Record<SortField, SortDir> = {
  username: 'asc',
  power_at_open: 'desc',
  state: 'asc',
  updated_at: 'desc',
};

function stateRank(s: MigrationState): number {
  const normalized: MigrationState = s === 'claimed' || s === 'contacted' ? 'pending' : s;
  const idx = STATE_ORDER.indexOf(normalized);
  return idx === -1 ? STATE_ORDER.length : idx;
}

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
  const canView = isAtLeast('power');
  const isOfficer = isAtLeast('officer');
  const isAdmin = isAtLeast('admin');

  const router = useRouter();
  const searchParams = useSearchParams();

  const [cycles, setCycles] = useState<MigrationCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [cases, setCases] = useState<MigrationCase[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [flaggedIds, setFlaggedIds] = useState<number[]>([]);
  // Latest uploaded-scan totals — required for the Power Impact card. Persisted in
  // localStorage so a refresh doesn't lose the reading.
  const [latestScanTotalPower, setLatestScanTotalPower] = useState<number | null>(null);
  const [latestScanLabel, setLatestScanLabel] = useState<string | null>(null);
  const [latestScanUploadedAt, setLatestScanUploadedAt] = useState<string | null>(null);

  // Restore last-uploaded scan metadata on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('emigration-latest-scan');
      if (raw) {
        const parsed = JSON.parse(raw) as { totalPower: number; label: string; uploadedAt: string };
        setLatestScanTotalPower(parsed.totalPower);
        setLatestScanLabel(parsed.label);
        setLatestScanUploadedAt(parsed.uploadedAt);
      }
    } catch { /* ignore */ }
  }, []);

  const recordScanTotals = (totalPower: number, label: string) => {
    const uploadedAt = new Date().toISOString();
    setLatestScanTotalPower(totalPower);
    setLatestScanLabel(label);
    setLatestScanUploadedAt(uploadedAt);
    try {
      window.localStorage.setItem('emigration-latest-scan', JSON.stringify({ totalPower, label, uploadedAt }));
    } catch { /* ignore */ }
  };
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Tab state — initial value priority:
  //   1. ?tab= query string (so a shared link wins)
  //   2. localStorage (returning user's last tab)
  //   3. zero_list (sensible default)
  // The URL `?tab` value is normalized to dashes (zero-list) and converted
  // back to underscores internally so links read naturally.
  const tabFromQuery = ((): 'cycle' | 'zero_list' | 'scans' | null => {
    const raw = searchParams.get('tab');
    const norm = raw?.replace(/-/g, '_');
    if (norm === 'cycle' || norm === 'zero_list' || norm === 'scans') return norm;
    return null;
  })();
  const [tab, setTabState] = useState<'cycle' | 'zero_list' | 'scans'>(() => {
    if (tabFromQuery) return tabFromQuery;
    if (typeof window === 'undefined') return 'zero_list';
    const saved = window.localStorage.getItem('emigration-active-tab');
    if (saved === 'cycle' || saved === 'zero_list' || saved === 'scans') return saved;
    return 'zero_list';
  });
  const setTab = useCallback((next: 'cycle' | 'zero_list' | 'scans') => {
    setTabState(next);
    try { window.localStorage.setItem('emigration-active-tab', next); } catch { /* ignore */ }
    const params = new URLSearchParams(searchParams.toString());
    // Default tab (zero_list) → omit from URL to keep `/migration` clean.
    // Dashes in the URL (zero-list) read more naturally than underscores.
    if (next === 'zero_list') params.delete('tab');
    else params.set('tab', next.replace(/_/g, '-'));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/migration', { scroll: false });
  }, [router, searchParams]);
  const [stateFilter, setStateFilter] = useState<MigrationState | 'all' | 'active' | 'suggested' | 'exception_requested'>('active');
  const [sortField, setSortField] = useState<SortField>('power_at_open');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(DEFAULT_SORT_DIR[field]);
      return field;
    });
  }, []);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [showEditCycle, setShowEditCycle] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  // Instructions panel — collapsed state persists per browser.
  const [guideOpen, setGuideOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('migration-guide-collapsed') === '0';
  });
  const toggleGuide = () => {
    setGuideOpen((o) => {
      const next = !o;
      try { window.localStorage.setItem('migration-guide-collapsed', next ? '0' : '1'); } catch { /* ignore */ }
      return next;
    });
  };
  const [orientationOpen, setOrientationOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('emigration-orientation-collapsed') === '0';
  });
  const toggleOrientation = () => {
    setOrientationOpen((o) => {
      const next = !o;
      try { window.localStorage.setItem('emigration-orientation-collapsed', next ? '0' : '1'); } catch { /* ignore */ }
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

  // Manual refetch used by row actions so the UI updates immediately even if
  // Supabase realtime isn't enabled for the migration_cases table.
  const refetchCases = useCallback(async () => {
    if (!selectedCycleId) return;
    const fresh = await listCases(selectedCycleId);
    setCases(fresh);
  }, [selectedCycleId]);

  const selectedCycle = useMemo(() => cycles.find((c) => c.id === selectedCycleId) ?? null, [cycles, selectedCycleId]);

  const deadlineMs = selectedCycle ? new Date(selectedCycle.deadline).getTime() : 0;
  const pastDeadline = !!selectedCycle && now.getTime() > deadlineMs;
  const hoursToDeadline = selectedCycle ? (deadlineMs - now.getTime()) / 3_600_000 : 0;

  // Derived state — claimed/contacted are rolled into pending for display purposes.
  const counts = useMemo(() => {
    const c: Record<MigrationState, number> = {
      pending: 0, claimed: 0, contacted: 0, excepted: 0, migrated: 0, marked_to_zero: 0, zeroed: 0, afk: 0,
    };
    for (const k of cases) c[k.state]++;
    c.pending += c.claimed + c.contacted;
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
    else if (stateFilter === 'suggested') list = list.filter((c) => c.migration_suggested_at !== null && !TERMINAL_STATES.includes(c.state));
    else if (stateFilter === 'exception_requested') list = list.filter((c) => c.exception_requested_at !== null && !TERMINAL_STATES.includes(c.state));
    else if (stateFilter === 'pending') list = list.filter((c) => c.state === 'pending' || c.state === 'claimed' || c.state === 'contacted');
    else if (stateFilter !== 'all') list = list.filter((c) => c.state === stateFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(
        (c) =>
          c.username.toLowerCase().includes(q) || (qDigits.length >= 3 && String(c.character_id).includes(qDigits)),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'username') {
        cmp = a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
      } else if (sortField === 'power_at_open') {
        cmp = a.power_at_open - b.power_at_open;
      } else if (sortField === 'state') {
        cmp = stateRank(a.state) - stateRank(b.state);
      } else if (sortField === 'updated_at') {
        cmp = a.updated_at.localeCompare(b.updated_at);
      }
      // Stable tiebreak on power desc so equal-key rows stay deterministic.
      if (cmp === 0) cmp = b.power_at_open - a.power_at_open;
      else cmp *= dir;
      return cmp;
    });
    return sorted;
  }, [cases, search, stateFilter, sortField, sortDir]);

  // Power math — scoped to the current cycle. Kingdom power comes from the
  // admin-uploaded scan; AFK cases are subtracted to get the active-kingdom
  // power that we can actually count on. The card shows a prompt until a scan
  // is uploaded.
  const powerImpact = useMemo(() => {
    const rawKingdom = latestScanTotalPower ?? 0;
    const afkPower = cases
      .filter((c) => c.state === 'afk')
      .reduce((s, c) => s + c.power_at_open, 0);
    const totalKingdom = Math.max(0, rawKingdom - afkPower);
    const activePower = activeCases.reduce((s, c) => s + c.power_at_open, 0);
    const afterMigrate = totalKingdom - activePower;
    const zeroLoss = activePower * ZERO_POWER_DROP;
    const afterZero = totalKingdom - zeroLoss;
    return { totalKingdom, rawKingdom, afkPower, activePower, afterMigrate, zeroLoss, afterZero };
  }, [cases, activeCases, latestScanTotalPower]);

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

  if (!canView) {
    return (
      <div className="min-h-screen">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-10">
          <Link href="/dkp" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] mb-6">
            <ArrowLeft size={14} /> Back to DKP
          </Link>
          <div className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-8 text-center">
            <Lock className="mx-auto text-[var(--text-muted)] mb-3" />
            <h1 className="text-lg font-semibold text-[var(--foreground)] mb-2">Sign in required</h1>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Emigration tracking requires at least power-user access. Sign in on the DKP page or use the Sign in button to continue.
            </p>
            <div className="flex items-center justify-center gap-2">
              <SessionBadge />
              <Link href="/dkp" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors">
                Back to DKP
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-10">
        {/* Header */}
        <header className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div>
            <Link href="/dkp" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] mb-1 sm:mb-2">
              <ArrowLeft size={12} /> Back to DKP
            </Link>
            <h1 className="text-lg sm:text-xl font-semibold text-[var(--foreground)]">Emigration</h1>
            <p className="hidden sm:block text-xs text-[var(--text-muted)] mt-1">
              Track players flagged for emigration through claim → contact → outcome.
            </p>
          </div>
          <SessionBadge />
        </header>

        {/* Page-level orientation — for first-time users / refresher. */}
        <section className="mb-4 rounded-xl bg-violet-500/5 border border-violet-500/30 overflow-hidden">
          <button
            onClick={toggleOrientation}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-violet-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-violet-400" />
              <span className="text-sm font-semibold text-[var(--foreground)]">First time here? Read this.</span>
              {!orientationOpen && <span className="text-[11px] text-[var(--text-muted)]">click to expand</span>}
            </div>
            <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${orientationOpen ? 'rotate-180' : ''}`} />
          </button>
          {orientationOpen && (
            <div className="px-4 pb-4 pt-1 border-t border-violet-500/30 text-sm text-[var(--text-secondary)] space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">What is this page?</div>
                <p className="text-xs">
                  This is where Angmar leadership decides who shouldn&apos;t be in Kingdom 23 and tracks them through to leaving (emigrating) or being zeroed (attacked until their power drops to ~0). It works by:
                </p>
                <ol className="text-xs mt-2 space-y-1 list-decimal pl-5">
                  <li><strong>Identifying targets</strong> — by looking at scans, comparing them, or cross-referencing the migrant-application sheet</li>
                  <li><strong>Adding them to a list</strong> — either a time-bound <em>Cycle</em> (with a deadline, formal exception process) or a continuous <em>Zero List</em> (kingdom-wide kill queue)</li>
                  <li><strong>Acting on the list</strong> — Power members go attack/zero in-game, admins record outcomes</li>
                </ol>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">Three tabs, three jobs</div>
                <ul className="text-xs space-y-2 list-disc pl-5">
                  <li>
                    <strong>Cycle</strong> — formal monthly emigration round. People flagged on DKP get put on this list, contacted via in-game mail, and either leave by the deadline or get zeroed. Has officer / admin / exception workflow.
                  </li>
                  <li>
                    <strong>Zero List</strong> — the kingdom-wide kill queue. Continuous (no deadline). Power members come here to see who to attack and grab coords. Admin manages.
                  </li>
                  <li>
                    <strong>Scans</strong> — where you <em>find</em> people to put on the Zero List. The default sub-tab <em>Find Candidates</em> shows four cards (power growers, illegal arrivals, didn&apos;t emigrate, suggested players to evaluate). Click a card → check rows → add to Zero List.
                  </li>
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">Most common workflow (in 5 steps)</div>
                <ol className="text-xs space-y-1.5 list-decimal pl-5">
                  <li>Open the <strong>Scans</strong> tab. <em>Find Candidates</em> is the default sub-tab.</li>
                  <li>Each of the 4 cards has a number on the right. That&apos;s how many candidates need attention. Open the one with the biggest number first.</li>
                  <li>Look at the rows. Each shows: name, gov ID, power, alliance (if known), the migrant-sheet decision (Yes/No/Maybe/etc.), and coords (if known).</li>
                  <li>Check the boxes next to people you want to attack. Click <strong>Add to Zero List</strong>. (Admin only — if you don&apos;t see checkboxes you&apos;re not signed in as admin.)</li>
                  <li>Switch to the <strong>Zero List</strong> tab. Your additions are there. Power members can now click coordinates to copy <code className="text-[var(--text-secondary)]">x,y</code> and teleport in-game to attack.</li>
                </ol>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">Glossary</div>
                <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  <div><strong>Scan</strong> — a snapshot of who&apos;s in the kingdom and what their stats are. Different scan types have different fields.</div>
                  <div><strong>Auto-scrape</strong> — daily scan pulled by a script from the Lilith API. Always fresh but no coords / kills / alliance.</div>
                  <div><strong>Kingdom (Davide) scan</strong> — power/stats snapshot uploaded via Migration Tracker. Has kills, deaths, gathered.</div>
                  <div><strong>Location scan</strong> — coordinate-focused CSV (e.g. <code className="text-[var(--text-secondary)]">scan_3923.csv</code>). Only used to refresh Zero List coords; not saved.</div>
                  <div><strong>Gov ID</strong> — governor ID, the unique number for each player. Names can change; gov IDs don&apos;t.</div>
                  <div><strong>Cycle</strong> — a time-bound emigration round (e.g. &quot;April 2026&quot;) with a deadline.</div>
                  <div><strong>Zero List</strong> — the continuous, no-deadline kingdom-wide kill queue.</div>
                  <div><strong>DKP</strong> — kingdom contribution score. Players who don&apos;t hit thresholds get flagged → can&apos;t stay.</div>
                  <div><strong>Migrant sheet</strong> — the Google Sheet where applicants apply to join K23. Decision = Yes / No / Maybe / Pending.</div>
                  <div><strong>Notified / To Zero / Zeroed / Emigrated / AFK / Excepted</strong> — the lifecycle states a target moves through.</div>
                  <div><strong>(x, y)</strong> — map coordinates. Click in any list to copy; paste into the in-game teleport / scout / attack dialog.</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">Who can do what</div>
                <ul className="text-xs space-y-1 list-disc pl-5">
                  <li><strong>Power</strong> (no real privileges, but signed in) — read everything, copy coords. <em>Cannot edit anything.</em></li>
                  <li><strong>Officer</strong> — can claim/contact/mark cases <em>on the Cycle tab</em>. On the Zero List tab they can mark <em>Emigrated</em>, <em>Confirm Zeroed</em> after an attack, and toggle the <em>Delay</em> hold. Adding/removing entries, To Zero, Except, and AFK stay admin-only.</li>
                  <li><strong>Admin</strong> — full access. Creates cycles, manages Zero List, approves exceptions, uploads scans, etc.</li>
                </ul>
              </div>

              <p className="text-[11px] text-[var(--text-muted)] pt-2 border-t border-violet-500/20">
                You can collapse this panel and it&apos;ll stay collapsed across reloads. Each tab also has its own &quot;How this works&quot; for tab-specific instructions.
              </p>
            </div>
          )}
        </section>

        {/* Tab strip */}
        <nav className="mb-4 flex gap-1 border-b border-[var(--border)] overflow-x-auto -mx-1 px-1 scrollbar-hide">
          {([
            { id: 'cycle', label: 'Cycle' },
            { id: 'zero_list', label: 'Zero List' },
            { id: 'scans', label: 'Scans' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 whitespace-nowrap ${
                tab === t.id
                  ? 'border-[#4318ff] text-[var(--foreground)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'zero_list' && (
          <ZeroListTab isOfficer={isOfficer} isAdmin={isAdmin} actorName={officerName ?? null} />
        )}
        {tab === 'scans' && (
          <ScansTab isOfficer={isOfficer} isAdmin={isAdmin} actorName={officerName ?? null} />
        )}

        {tab === 'cycle' && (<>

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
            {isOfficer && selectedCycle && !selectedCycle.closed_at && (
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
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] text-sm text-[var(--text-secondary)] space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                A <strong>Cycle</strong> is a formal time-bound emigration round (e.g. &quot;April 2026&quot;). DKP-flagged players get snapshot into the cycle, contacted, and either emigrate by the deadline or get zeroed. Different from the Zero List tab — Cycles are formal and time-bound; the Zero List is continuous and kingdom-wide.
              </p>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Start a new cycle (admin)</div>
                <ol className="space-y-1 text-xs list-decimal pl-5">
                  <li>Make sure DKP flagging is current. Open <a href="/dkp" className="text-cyan-400 hover:underline">/dkp</a> and confirm the flagged-for-emigration list is what you want.</li>
                  <li>On this Cycle tab, click <strong>+ New cycle</strong> in the cycle bar.</li>
                  <li>Name it (e.g. &quot;May 2026 — KvK2 → KvK2&quot;), set a UTC deadline, and check &quot;Snapshot currently flagged players&quot;.</li>
                  <li>Click <strong>Create</strong>. Cases are created in the <em>Notified</em> state.</li>
                  <li>Bulk-mail the kingdom with the list and the deadline. The page is your reference; messaging happens elsewhere.</li>
                </ol>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Officer working a case during the cycle</div>
                <ol className="space-y-1 text-xs list-decimal pl-5">
                  <li>Find the case in the table. Use the search box if needed.</li>
                  <li>Click <strong>Claim</strong> to take ownership (your name shows as the owner).</li>
                  <li>Mail the player in-game. Click <strong>Mark Contacted</strong> when you&apos;ve done it.</li>
                  <li>Listen for their response, then pick the right outcome:
                    <ul className="mt-1 space-y-0.5 list-circle pl-5">
                      <li>They agree to leave → wait, then click <strong>Emigrated</strong> when they&apos;re gone (or use Scan Delta to auto-detect).</li>
                      <li>They&apos;re going inactive but staying → <strong>AFK</strong>.</li>
                      <li>They have a legitimate reason to stay → <strong>Request Exception</strong>, write the reason, suggest yes/no for the admin.</li>
                      <li>They refuse → wait until after the deadline, then <strong>Mark to Zero</strong>.</li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Recipe — Admin closing out the cycle</div>
                <ol className="space-y-1 text-xs list-decimal pl-5">
                  <li>After the deadline, every active case should be either <em>To Zero</em> or have an exception request waiting.</li>
                  <li>Banner at the top shows pending exception requests. Click each one, read the reason, click <strong>Mark Exception</strong> (approve) or <strong>Deny</strong>.</li>
                  <li>For zeroed targets: once the in-game attack actually happens, click <strong>Confirm Zeroed</strong> on each case. (If they emigrated before being zeroed, click <strong>Emigrated</strong> instead.)</li>
                  <li>When everyone&apos;s in a terminal state, click <strong>Close cycle</strong>. The cycle stays as a historical record but won&apos;t accept new cases.</li>
                </ol>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">What each state means</div>
                <ul className="text-xs space-y-1">
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]">Notified</span> Player has been told. Waiting for officer action.</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/30">Excepted</span> Admin granted a pass — they can stay (reason recorded).</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-green-500/15 text-green-400 border-green-500/30">Emigrated</span> Player left the kingdom. Win.</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-slate-500/15 text-slate-300 border-slate-500/30">AFK</span> Player is going inactive but staying. Their power is subtracted from the Kingdom Power calculation since they&apos;re effectively zero.</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-orange-500/15 text-orange-400 border-orange-500/30">To Zero</span> Officer decided to zero them. <em>Not yet zeroed in-game</em> — this is just the decision.</li>
                  <li><span className="inline-block px-1.5 py-0.5 mr-1 rounded text-[10px] font-semibold border bg-rose-500/15 text-rose-400 border-rose-500/30">Zeroed</span> Confirmed zeroed in-game.</li>
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Things you might miss</div>
                <ul className="text-xs space-y-1 list-disc pl-5">
                  <li><strong>Scan Delta panel</strong> (top of cycle, admin only) — upload a fresh stats XLSX. Players missing from the new scan get a &quot;Suggested emigrated&quot; badge so you don&apos;t have to audit one by one. Click Emigrated to confirm.</li>
                  <li><strong>Add current flags</strong> — if officers flag more people on DKP mid-cycle, click this button to pull them in. Duplicates skipped automatically.</li>
                  <li><strong>Notes field</strong> — click &quot;Notes&quot; on any case to leave context for other officers (&quot;said they&apos;d move Friday&quot;, &quot;alt account&quot;, etc.). Shared, not private.</li>
                  <li><strong>Sortable headers</strong> — click <em>Player / Power / State / Last action</em> column headers to sort. Click again to flip direction.</li>
                  <li><strong>Power role</strong> can&apos;t see this tab at all — it requires officer or admin.</li>
                </ul>
              </div>
            </div>
          )}
        </section>

        {!selectedCycle ? (
          <div className="rounded-xl bg-[var(--background-card)] border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
            {isAdmin ? 'Create a cycle to start tracking emigration cases.' : 'No cycle selected. Ask an admin to create one.'}
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <section className="mb-4 grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-3">
              {STATE_ORDER.map((s) => (
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

            {/* Scan delta uploader — drives both Kingdom Power and emigration suggestions */}
            {isOfficer && (
              <ScanDeltaPanel
                cases={cases}
                cycleId={selectedCycle.id}
                onScanTotals={recordScanTotals}
                currentScanLabel={latestScanLabel}
                currentScanUploadedAt={latestScanUploadedAt}
                hasScan={latestScanTotalPower !== null}
              />
            )}

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
              {latestScanTotalPower === null ? (
                <div className="rounded-lg bg-[var(--background-secondary)] border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]">
                  Upload today&apos;s kingdom export above to calculate kingdom power and check for emigrants.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] p-3">
                    <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Kingdom Power</div>
                    <div className="text-xl font-bold tabular-nums text-[var(--foreground)]">{fmtM(powerImpact.totalKingdom)}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate" title={latestScanLabel ?? ''}>From {latestScanLabel}</div>
                    {powerImpact.afkPower > 0 && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        −{fmtM(powerImpact.afkPower)} AFK ({counts.afk})
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-3">
                    <div className="text-xs text-rose-400 uppercase tracking-wider mb-1">If Active Cases Emigrate</div>
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
              )}
            </section>

            {/* At-risk banner */}
            {atRisk.length > 0 && (
              <section className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-300">
                <strong>{atRisk.length}</strong> case{atRisk.length === 1 ? '' : 's'} past the deadline and not yet resolved.
              </section>
            )}

            {/* Pending exception requests (admin-visible cue) */}
            {isAdmin && (() => {
              const pending = cases.filter((c) => c.exception_requested_at !== null && !TERMINAL_STATES.includes(c.state));
              if (pending.length === 0) return null;
              return (
                <section className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-300 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{pending.length}</strong> exception request{pending.length === 1 ? '' : 's'} waiting for your review.
                  </span>
                  <button
                    onClick={() => setStateFilter('exception_requested')}
                    className="text-xs underline hover:text-amber-200"
                  >
                    Show only these
                  </button>
                </section>
              );
            })()}

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
                <option value="suggested">Suggested from scan</option>
                <option value="exception_requested">Exception requests pending</option>
                <option value="all">All</option>
                {STATE_ORDER.map((s) => (
                  <option key={s} value={s}>{STATE_LABELS[s]}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--text-muted)] ml-auto">{filteredCases.length} shown · {cases.length} total</span>
            </section>

            {/* Cases table */}
            <section className="rounded-xl bg-[var(--background-card)] border border-[var(--border)]">
              <div className="overflow-auto max-h-[calc(100vh-240px)] rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-20 bg-[var(--background-secondary)] text-[var(--text-muted)] text-xs uppercase tracking-wider shadow-[0_1px_0_var(--border)]">
                    <tr>
                      <SortableTh label="Player" field="username" active={sortField} dir={sortDir} onSort={toggleSort} />
                      <SortableTh label="Power" field="power_at_open" align="right" active={sortField} dir={sortDir} onSort={toggleSort} />
                      <SortableTh label="State" field="state" active={sortField} dir={sortDir} onSort={toggleSort} />
                      <SortableTh label="Last action" field="updated_at" active={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((c) => (
                      <CaseRow
                        key={c.id}
                        caseRow={c}
                        officerName={officerName}
                        isOfficer={isOfficer}
                        isAdmin={isAdmin}
                        pastDeadline={pastDeadline}
                        onRefresh={refetchCases}
                      />
                    ))}
                    {filteredCases.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
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

        </>)}

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
          <h3 className="text-sm font-semibold text-[var(--foreground)]">New emigration cycle</h3>
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

function ScanDeltaPanel({
  cases,
  cycleId,
  onScanTotals,
  currentScanLabel,
  currentScanUploadedAt,
  hasScan,
}: {
  cases: MigrationCase[];
  cycleId: string;
  onScanTotals: (totalPower: number, label: string) => void;
  currentScanLabel: string | null;
  currentScanUploadedAt: string | null;
  hasScan: boolean;
}) {
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
      const totalPower = rows.reduce((s, r) => s + (r.power ?? 0), 0);
      onScanTotals(totalPower, file.name);
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

  const uploadedWhen = currentScanUploadedAt ? new Date(currentScanUploadedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <section className={`mb-4 rounded-xl border p-4 ${hasScan ? 'bg-[var(--background-card)] border-[var(--border)]' : 'bg-amber-500/5 border-amber-500/40'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <h3 className={`text-sm font-semibold ${hasScan ? 'text-[var(--foreground)]' : 'text-amber-400'}`}>
            {hasScan ? 'Kingdom scan' : 'Upload today\'s kingdom export'}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {hasScan
              ? 'Kingdom Power is calculated from this scan. Upload a newer one anytime to refresh and re-check for emigrants.'
              : 'Required: a single-day kingdom stats XLSX. Used for (1) current kingdom power and (2) detecting who emigrated.'}
          </p>
          {hasScan && currentScanLabel && (
            <p className="text-[11px] text-emerald-400 mt-1 font-mono break-all">
              {currentScanLabel}{uploadedWhen ? ` · uploaded ${uploadedWhen}` : ''}
            </p>
          )}
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
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
            hasScan
              ? 'bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              : 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
          }`}
        >
          <Upload size={12} /> {busy ? 'Scanning…' : hasScan ? 'Upload newer scan' : 'Upload kingdom export'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {suggestions && (
        <div className="mt-3 text-xs text-[var(--text-secondary)]">
          {suggestions.length === 0 ? (
            <span className="text-[var(--text-muted)]">Scan checked — no active cases are missing from the new scan.</span>
          ) : (
            <>
              <div className="mb-2">
                <span className="text-amber-400 font-medium">{suggestions.length}</span> active case{suggestions.length === 1 ? '' : 's'} missing from the new scan — marked as suggested-emigrated. Confirm each in the table below (or click the "Suggested" filter).
              </div>
              <ul className="space-y-0.5 max-h-48 overflow-y-auto pl-4 list-disc text-[var(--text-muted)]">
                {suggestions.map((c) => (
                  <li key={c.id}>
                    <span className="text-[var(--text-secondary)]">{c.username}</span>
                    <span className="ml-2 font-mono text-[10px]">#{c.character_id}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ——— Case row with actions ———

function CaseRow({
  caseRow: c,
  officerName,
  isOfficer,
  isAdmin,
  pastDeadline,
  onRefresh,
}: {
  caseRow: MigrationCase;
  officerName: string | null;
  isOfficer: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  pastDeadline: boolean;
}) {
  const [showException, setShowException] = useState(false);
  const [showEditException, setShowEditException] = useState(false);
  const [showRequestException, setShowRequestException] = useState(false);
  const [reason, setReason] = useState(c.exception_reason ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesVal, setNotesVal] = useState(c.notes ?? '');
  const [busy, setBusy] = useState(false);

  const hasPendingRequest = c.exception_requested_at !== null;

  const isActive = !TERMINAL_STATES.includes(c.state);
  const suggested = c.migration_suggested_at !== null;

  const lastAction = (() => {
    const entries = [
      { label: 'zeroed', iso: c.zeroed_at },
      { label: 'marked to zero', iso: c.marked_to_zero_at },
      { label: 'afk', iso: c.afk_at },
      { label: 'excepted', iso: c.excepted_at },
      { label: 'emigrated', iso: c.migrated_confirmed_at },
      { label: 'suggested', iso: c.migration_suggested_at },
      { label: 'contacted', iso: c.contacted_at },
      { label: 'claimed', iso: c.claimed_at },
    ].filter((e) => e.iso);
    return entries[0] ?? null;
  })();

  const wrap = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      console.error('Case action failed', e);
      alert(`Action failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const actorName = officerName?.trim() || 'officer';

  return (
    <tr className={`border-t border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors ${pastDeadline && isActive ? 'bg-rose-500/5' : ''}`}>
      <td className="px-3 py-2">
        <CopyablePlayerCell name={c.username} govId={c.character_id} />
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM(c.power_at_open)}</td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATE_STYLES[c.state]}`}>
          {STATE_LABELS[c.state]}
        </span>
        {suggested && isActive && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] text-amber-400">Suggested emigrated from scan</span>
            {isOfficer && (
              <button
                disabled={busy}
                onClick={() => wrap(() => dismissMigrationSuggestion(c.id))}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--foreground)] underline"
                title="They didn't actually emigrate — remove the suggestion flag"
              >
                Not emigrated
              </button>
            )}
          </div>
        )}
        {hasPendingRequest && isActive && (
          <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/5 p-1.5 text-[10px] text-[var(--text-secondary)]">
            <div className="text-amber-300 font-semibold">
              Exception requested by {c.exception_requested_by}
              {c.exception_suggestion && <> · suggests <span className={c.exception_suggestion === 'approve' ? 'text-green-400' : 'text-rose-400'}>{c.exception_suggestion}</span></>}
            </div>
            {c.exception_request_reason && (
              <div className="italic mt-0.5 whitespace-pre-wrap">{c.exception_request_reason}</div>
            )}
            {isAdmin && (
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  disabled={busy}
                  onClick={() => { setReason(c.exception_request_reason ?? ''); setShowException(true); }}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
                >
                  Approve exception
                </button>
                <button
                  disabled={busy}
                  onClick={() => wrap(() => denyExceptionRequest(c.id))}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25"
                >
                  Deny
                </button>
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
        {lastAction ? <>{lastAction.label} · {formatDateTime(lastAction.iso)}</> : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {isOfficer && isActive && c.state !== 'marked_to_zero' && (
            <button disabled={busy} onClick={() => wrap(() => confirmMigrated(c.id, actorName))} className="px-2 py-1 text-[11px] rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25">Emigrated</button>
          )}
          {isOfficer && isActive && c.state !== 'marked_to_zero' && (
            <button disabled={busy} onClick={() => wrap(() => markAfk(c.id, actorName))} className="px-2 py-1 text-[11px] rounded bg-slate-500/15 text-slate-300 border border-slate-500/30 hover:bg-slate-500/25" title="Player is going inactive / AFK. Power will be subtracted from the Kingdom Power total.">AFK</button>
          )}
          {isOfficer && !isAdmin && isActive && c.state !== 'marked_to_zero' && !c.exception_requested_at && (
            <button disabled={busy} onClick={() => setShowRequestException(true)} className="px-2 py-1 text-[11px] rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20" title="Request an exception review from an admin. They'll see your reason and suggestion.">Request Exception</button>
          )}
          {isActive && isAdmin && c.state !== 'marked_to_zero' && (
            <button disabled={busy} onClick={() => setShowException(true)} className="px-2 py-1 text-[11px] rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25">Exception</button>
          )}
          {isOfficer && isActive && pastDeadline && c.state !== 'marked_to_zero' && (
            <button disabled={busy} onClick={() => wrap(() => markToZero(c.id, actorName))} className="px-2 py-1 text-[11px] rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25" title="Mark this player to be zeroed. Doesn't mean they've been zeroed yet — confirm once it's done in-game.">Mark to Zero</button>
          )}
          {isOfficer && c.state === 'marked_to_zero' && (
            <>
              <button disabled={busy} onClick={() => wrap(() => confirmZeroed(c.id, actorName))} className="px-2 py-1 text-[11px] rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25" title="Confirm the player has been zeroed in-game.">Confirm Zeroed</button>
              <button disabled={busy} onClick={() => wrap(() => confirmMigrated(c.id, actorName))} className="px-2 py-1 text-[11px] rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25" title="If they emigrated instead of being zeroed.">Emigrated</button>
            </>
          )}
          {isOfficer && (!isActive || c.state === 'marked_to_zero') && (
            <button
              disabled={busy}
              onClick={() => wrap(async () => { await undoLastStateChange(c.id); })}
              className="px-2 py-1 text-[11px] rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] inline-flex items-center gap-1"
              title="Revert the most recent state change one step (e.g. undo Confirm Zeroed back to Mark to Zero)."
            >
              <RotateCcw size={11} /> Undo
            </button>
          )}
          {isOfficer && !isActive && isAdmin && (
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm(`Reset ${c.username} all the way back to the start of the cycle? This clears every state timestamp.`)) return;
                void wrap(() => resetCaseToPending(c.id));
              }}
              className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]"
              title="Hard reset — clears every state timestamp and returns the case to Notified."
            >
              Reset
            </button>
          )}
          <button onClick={() => setNotesOpen((o) => !o)} className="px-2 py-1 text-[11px] rounded text-[var(--text-muted)] hover:text-[var(--foreground)]">{isOfficer ? 'Notes' : 'View notes'}</button>
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
            {isOfficer ? (
              <>
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
              </>
            ) : (
              <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{c.notes || <span className="text-[var(--text-muted)] italic">No notes.</span>}</div>
            )}
          </div>
        )}
        {c.state === 'excepted' && (
          <div className="mt-1 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-1 text-[11px] text-amber-400">
            <span className="font-semibold">Exception:</span>
            <span className="italic flex-1 whitespace-pre-wrap">
              {c.exception_reason || <span className="opacity-60">(no reason given)</span>}
            </span>
            {isAdmin && (
              <button
                disabled={busy}
                onClick={() => { setReason(c.exception_reason ?? ''); setShowEditException(true); }}
                className="text-[10px] underline opacity-70 hover:opacity-100 shrink-0"
                title="Edit exception reason"
              >
                edit
              </button>
            )}
          </div>
        )}
        {c.notes && !notesOpen && (
          <div className="mt-1 text-[11px] text-[var(--text-muted)] italic">{c.notes}</div>
        )}
      </td>
      {showException && typeof document !== 'undefined' && createPortal(
        <ExceptionDialog
          onClose={() => setShowException(false)}
          onConfirm={async (r) => {
            await markException(c.id, officerName?.trim() || 'admin', r);
            setShowException(false);
            await onRefresh();
          }}
          initial={reason}
          setInitial={setReason}
        />,
        document.body,
      )}
      {showEditException && typeof document !== 'undefined' && createPortal(
        <ExceptionDialog
          onClose={() => setShowEditException(false)}
          onConfirm={async (r) => {
            await updateExceptionReason(c.id, r);
            setShowEditException(false);
            await onRefresh();
          }}
          initial={reason}
          setInitial={setReason}
          title="Edit exception reason"
          confirmLabel="Save reason"
        />,
        document.body,
      )}
      {showRequestException && typeof document !== 'undefined' && createPortal(
        <RequestExceptionDialog
          onClose={() => setShowRequestException(false)}
          onSubmit={async (r, suggestion) => {
            await requestException(c.id, officerName?.trim() || 'officer', r, suggestion);
            setShowRequestException(false);
            await onRefresh();
          }}
        />,
        document.body,
      )}
    </tr>
  );
}

function RequestExceptionDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: string, suggestion: 'approve' | 'deny') => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [suggestion, setSuggestion] = useState<'approve' | 'deny'>('approve');
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Request exception review</h3>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)]"><X size={16} /></button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">An admin will see your reason and suggestion, then approve or deny.</p>
        <label className="text-xs text-[var(--text-muted)]">Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          rows={4}
          className="mt-1 mb-3 w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)]/30"
          placeholder="Why should this player get an exception?"
        />
        <label className="text-xs text-[var(--text-muted)]">Your suggestion</label>
        <div className="mt-1 mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setSuggestion('approve')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              suggestion === 'approve'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setSuggestion('deny')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              suggestion === 'deny'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Deny
          </button>
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy || !reason.trim()}
            onClick={async () => { setBusy(true); try { await onSubmit(reason.trim(), suggestion); } finally { setBusy(false); } }}
            className="flex-1 px-3 py-2 rounded-lg bg-[#4318ff] text-white text-sm font-medium hover:bg-[#3a14e0] disabled:opacity-60 transition-colors"
          >
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ExceptionDialog({ onClose, onConfirm, initial, setInitial, title = 'Grant exception', confirmLabel = 'Confirm exception' }: { onClose: () => void; onConfirm: (reason: string) => Promise<void>; initial: string; setInitial: (s: string) => void; title?: string; confirmLabel?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
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
            {busy ? 'Saving…' : confirmLabel}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

