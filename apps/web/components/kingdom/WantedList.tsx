'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, RefreshCw, Lock, ExternalLink, Crosshair, X, Info, ChevronDown, ChevronUp, Undo2, Target, Skull, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchWantedSheet } from '@/lib/kingdom/parse';
import { WANTED_SHEET_URL, WANTED_SHEET_EDIT_URL } from '@/lib/kingdom/config';
import { matchesSearch } from '@/lib/search';
import type { WantedPlayer } from '@/lib/kingdom/types';

type OfficerMark = 'zeroed' | 'left';

interface WantedStatus {
  governor_id: number;
  status: OfficerMark;
  updated_at: string;
}

interface UndoAction {
  governorId: number;
  playerName: string;
  previousStatus: OfficerMark | null;
  newStatus: OfficerMark | null;
}

import { ADMIN_PASSWORD, OFFICER_PASSWORD } from '@/lib/auth-passwords';
const UNDO_TIMEOUT_MS = 6000;

/** Format power — sheet stores values in millions (e.g. 28 = 28M) */
const formatPower = (val: number): string => {
  if (!val) return '-';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(0) + 'K';
  return val + 'M';
};

/** Format summed power (already in millions) */
const formatTotalPower = (val: number): string => {
  if (!val) return '0M';
  if (val >= 1_000) return (val / 1_000).toFixed(2) + 'B';
  return val.toLocaleString() + 'M';
};

// ─── Sort types ────────────────────────────────────────────────────
type SortableField = 'name' | 'governorId' | 'power' | 'alliance' | 'reason' | 'zero' | 'handled';

interface SortRule {
  field: SortableField;
  direction: 'asc' | 'desc';
}

const DEFAULT_SORT_RULES: SortRule[] = [
  { field: 'handled', direction: 'asc' },
  { field: 'power', direction: 'desc' },
];

const SORT_FIELD_LABELS: Record<SortableField, string> = {
  name: 'Name',
  governorId: 'Gov ID',
  power: 'Power',
  alliance: 'Alliance',
  reason: 'Reason',
  zero: 'Zero?',
  handled: 'Handled',
};

export default function WantedList() {
  const [players, setPlayers] = useState<WantedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [allianceFilter, setAllianceFilter] = useState<string | null>(null);
  const [handledFilter, setHandledFilter] = useState<'all' | 'pending' | 'zeroed' | 'left'>('all');
  const [zeroFilter, setZeroFilter] = useState<'all' | 'yes' | 'no'>('all');

  // Sort state
  const [sortRules, setSortRules] = useState<SortRule[]>(DEFAULT_SORT_RULES);

  // Officer mode (can change handled status)
  const [isOfficer, setIsOfficer] = useState(false);
  // Admin mode (can see sheet link) — admin also gets officer privileges
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  // Supabase officer marks
  const [officerMarks, setOfficerMarks] = useState<Map<number, OfficerMark>>(new Map());

  // Undo state
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wantedPlayers, { data: statusRows }] = await Promise.all([
        fetchWantedSheet(WANTED_SHEET_URL),
        supabase.from('wanted_status').select('*'),
      ]);

      setPlayers(wantedPlayers);

      const marks = new Map<number, OfficerMark>();
      if (statusRows) {
        for (const row of statusRows as WantedStatus[]) {
          marks.set(row.governor_id, row.status);
        }
      }
      setOfficerMarks(marks);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wanted list');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handlePasswordSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setIsOfficer(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else if (password === OFFICER_PASSWORD) {
      setIsOfficer(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else {
      alert('Incorrect password');
      setPassword('');
    }
  };

  const handleMarkStatus = async (governorId: number, playerName: string, status: OfficerMark | null) => {
    // Save previous state for undo
    const previousStatus = officerMarks.get(governorId) || null;

    // Clear any existing undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    // Apply the change
    if (status === null) {
      await supabase.from('wanted_status').delete().eq('governor_id', governorId);
      setOfficerMarks(prev => {
        const next = new Map(prev);
        next.delete(governorId);
        return next;
      });
    } else {
      await supabase
        .from('wanted_status')
        .upsert({ governor_id: governorId, status, updated_at: new Date().toISOString() });
      setOfficerMarks(prev => new Map(prev).set(governorId, status));
    }

    // Show undo toast
    setUndoAction({ governorId, playerName, previousStatus, newStatus: status });
    undoTimerRef.current = setTimeout(() => setUndoAction(null), UNDO_TIMEOUT_MS);
  };

  const handleUndo = async () => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    const { governorId, previousStatus } = undoAction;

    if (previousStatus === null) {
      await supabase.from('wanted_status').delete().eq('governor_id', governorId);
      setOfficerMarks(prev => {
        const next = new Map(prev);
        next.delete(governorId);
        return next;
      });
    } else {
      await supabase
        .from('wanted_status')
        .upsert({ governor_id: governorId, status: previousStatus, updated_at: new Date().toISOString() });
      setOfficerMarks(prev => new Map(prev).set(governorId, previousStatus));
    }

    setUndoAction(null);
  };

  // Officer handling status: zeroed, left, or pending
  // Uses Supabase mark first, falls back to sheet "Zeroed" column
  const getHandledStatus = useCallback((player: WantedPlayer): 'pending' | 'zeroed' | 'left' => {
    const mark = officerMarks.get(player.governorId);
    if (mark) return mark;
    if (player.zeroed === 'yes') return 'zeroed';
    return 'pending';
  }, [officerMarks]);

  // ─── Sort logic ────────────────────────────────────────────────────
  const handleSort = (field: SortableField, addToChain: boolean) => {
    if (addToChain) {
      const existingIdx = sortRules.findIndex(r => r.field === field);
      if (existingIdx >= 0) {
        const updated = [...sortRules];
        updated[existingIdx] = {
          ...updated[existingIdx],
          direction: updated[existingIdx].direction === 'asc' ? 'desc' : 'asc',
        };
        setSortRules(updated);
      } else {
        const defaultDir = field === 'name' || field === 'alliance' ? 'asc' : 'desc';
        setSortRules([...sortRules, { field, direction: defaultDir }]);
      }
    } else {
      const existing = sortRules.find(r => r.field === field);
      const newDir = existing
        ? (existing.direction === 'asc' ? 'desc' : 'asc')
        : (field === 'name' || field === 'alliance' ? 'asc' : 'desc');
      setSortRules([{ field, direction: newDir }]);
    }
  };

  const removeSortRule = (field: SortableField) => {
    const remaining = sortRules.filter(r => r.field !== field);
    setSortRules(remaining.length > 0 ? remaining : DEFAULT_SORT_RULES);
  };

  const resetFiltersAndSort = () => {
    setSortRules(DEFAULT_SORT_RULES);
    setReasonFilter(null);
    setAllianceFilter(null);
    setHandledFilter('all');
    setZeroFilter('all');
    setSearch('');
  };

  const handledOrder = (status: 'pending' | 'zeroed' | 'left'): number => {
    switch (status) {
      case 'pending': return 0;
      case 'zeroed': return 1;
      case 'left': return 2;
    }
  };

  const zeroOrder = (val: 'yes' | 'no' | ''): number => {
    switch (val) {
      case 'yes': return 0;
      case 'no': return 1;
      default: return 2;
    }
  };

  const compareByField = useCallback((a: WantedPlayer, b: WantedPlayer, field: SortableField, direction: 'asc' | 'desc'): number => {
    let aVal: string | number;
    let bVal: string | number;

    switch (field) {
      case 'name':       aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
      case 'governorId': aVal = a.governorId; bVal = b.governorId; break;
      case 'power':      aVal = a.power2 || 0; bVal = b.power2 || 0; break;
      case 'alliance':   aVal = (a.alliance || '').toLowerCase(); bVal = (b.alliance || '').toLowerCase(); break;
      case 'reason':     aVal = (a.reason || '').toLowerCase(); bVal = (b.reason || '').toLowerCase(); break;
      case 'zero':       aVal = zeroOrder(a.zero); bVal = zeroOrder(b.zero); break;
      case 'handled':    aVal = handledOrder(getHandledStatus(a)); bVal = handledOrder(getHandledStatus(b)); break;
      default: return 0;
    }

    if (direction === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  }, [getHandledStatus]);

  // Only visible players (display !== false)
  const visiblePlayers = useMemo(() => players.filter(p => p.display), [players]);

  // Unique reasons for filter chips
  const reasons = useMemo(() => {
    const set = new Set<string>();
    for (const p of visiblePlayers) {
      if (p.reason) set.add(p.reason);
    }
    return [...set].sort();
  }, [visiblePlayers]);

  // Unique alliances for filter dropdown
  const alliances = useMemo(() => {
    const set = new Set<string>();
    for (const p of visiblePlayers) {
      if (p.alliance) set.add(p.alliance);
    }
    return [...set].sort();
  }, [visiblePlayers]);

  // Filtered and sorted players (from visible only)
  const filtered = useMemo(() => {
    return visiblePlayers
      .filter(p => {
        if (search && !matchesSearch(search, p.name, p.governorId)) return false;
        if (reasonFilter && p.reason !== reasonFilter) return false;
        if (allianceFilter && p.alliance !== allianceFilter) return false;
        if (zeroFilter !== 'all' && p.zero !== zeroFilter) return false;
        const handled = getHandledStatus(p);
        if (handledFilter !== 'all' && handled !== handledFilter) return false;
        return true;
      })
      .sort((a, b) => {
        for (const rule of sortRules) {
          const result = compareByField(a, b, rule.field, rule.direction);
          if (result !== 0) return result;
        }
        return 0;
      });
  }, [visiblePlayers, search, reasonFilter, allianceFilter, zeroFilter, handledFilter, sortRules, getHandledStatus, compareByField]);

  // Dashboard stats — based on visible players only (excludes hidden)
  const stats = useMemo(() => {
    let pendingCount = 0, pendingPower = 0;
    let zeroedCount = 0, zeroedPower = 0;
    let leftCount = 0;
    let toZeroCount = 0, toZeroPower = 0;

    for (const p of visiblePlayers) {
      const s = getHandledStatus(p);
      const power = p.power2 || 0;

      if (s === 'pending') {
        pendingCount++;
        pendingPower += power;
        if (p.zero === 'yes') {
          toZeroCount++;
          toZeroPower += power;
        }
      } else if (s === 'zeroed') {
        zeroedCount++;
        zeroedPower += power;
      } else {
        leftCount++;
      }
    }

    return {
      total: visiblePlayers.length,
      hidden: players.length - visiblePlayers.length,
      pendingCount, pendingPower,
      zeroedCount, zeroedPower,
      leftCount,
      toZeroCount, toZeroPower,
    };
  }, [players, visiblePlayers, getHandledStatus]);

  const handledBg = (status: 'pending' | 'zeroed' | 'left') => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'zeroed': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'left': return 'bg-sky-500/10 border-sky-500/30 text-sky-400';
    }
  };

  // Instructions toggle
  const [showInstructions, setShowInstructions] = useState(false);

  // Sort icon component
  const SortIcon = ({ field }: { field: SortableField }) => {
    const ruleIndex = sortRules.findIndex(r => r.field === field);
    const isActive = ruleIndex >= 0;
    const rule = isActive ? sortRules[ruleIndex] : null;
    const Icon = rule?.direction === 'desc' ? ChevronDown : ChevronUp;
    const showPriority = sortRules.length > 1 && isActive;

    return (
      <span className="inline-flex items-center gap-0.5">
        <Icon className={`w-3.5 h-3.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`} />
        {showPriority && (
          <span className="text-[9px] text-[var(--text-muted)] opacity-60">
            {ruleIndex + 1}
          </span>
        )}
      </span>
    );
  };

  const hasActiveFilters = search || reasonFilter || allianceFilter || handledFilter !== 'all' || zeroFilter !== 'all'
    || JSON.stringify(sortRules) !== JSON.stringify(DEFAULT_SORT_RULES);

  // Sortable header helper
  const SortHeader = ({ field, label, align = 'left' }: { field: SortableField; label: string; align?: 'left' | 'right' | 'center' }) => (
    <th className={`text-${align} px-3 py-2 sm:py-3`}>
      <button
        onClick={(e) => handleSort(field, e.shiftKey)}
        title="Click to sort, Shift+click to add secondary sort"
        className={`flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors ${align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''}`}
      >
        {label} <SortIcon field={field} />
      </button>
    </th>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10">
            <Crosshair className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Wanted</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {stats.total} players tracked{stats.hidden > 0 && ` · ${stats.hidden} hidden`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowInstructions(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
          >
            <Info size={16} />
            <span className="hidden sm:inline">Instructions</span>
            {showInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          {!isOfficer && (
            <button
              onClick={() => setShowPasswordPrompt(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              <Lock size={16} />
              <span className="hidden sm:inline">Login</span>
            </button>
          )}
          {isAdmin && (
            <a
              href={WANTED_SHEET_EDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <ExternalLink size={16} />
              <span className="hidden sm:inline">Edit Sheet</span>
            </a>
          )}
        </div>
      </div>

      {/* Instructions panel */}
      {showInstructions && (
        <div className="mb-4 px-4 py-4 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] space-y-3">
          <p>
            This page tracks wanted players in the kingdom. The list is pulled from a shared Google Sheet that admins can edit.
          </p>
          <div>
            <p className="font-semibold text-[var(--foreground)] mb-1">Columns</p>
            <ul className="list-disc list-inside space-y-0.5 text-[var(--text-muted)]">
              <li><span className="text-[var(--text-secondary)]">Zero?</span> &mdash; Whether the player should be zeroed (from the sheet)</li>
              <li><span className="text-[var(--text-secondary)]">Handled</span> &mdash; Officer-set status: Pending, Zeroed, or Left kingdom</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)] mb-1">Zeroing Priority</p>
            <ol className="list-decimal list-inside space-y-0.5 text-[var(--text-muted)]">
              <li>Farm killers and hostile players &mdash; zero first</li>
              <li>Players who refuse to follow kingdom rules</li>
              <li className="text-amber-400 font-medium">Illegal migrants &mdash; zero LAST (they may still leave on their own)</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)] mb-1">Officer Mode</p>
            <p className="text-[var(--text-muted)]">
              Log in as an officer to mark players as &quot;Zeroed&quot; or &quot;Left Kingdom&quot;. You can undo any status change within a few seconds.
            </p>
          </div>
        </div>
      )}

      {/* Officer/Admin mode banner */}
      {isOfficer && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <Lock size={14} />
            <span className="font-medium">{isAdmin ? 'Admin Mode' : 'Officer Mode'}</span>
            <span className="hidden sm:inline text-amber-400/60">&mdash; Mark players as zeroed or left kingdom</span>
          </div>
          <button
            onClick={() => { setIsOfficer(false); setIsAdmin(false); }}
            className="text-amber-400/60 hover:text-amber-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Dashboard cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Pending */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Pending</span>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{stats.pendingCount}</p>
            <p className="text-sm font-semibold text-[var(--text-secondary)] mt-1">{formatTotalPower(stats.pendingPower)}</p>
            <p className="text-[10px] text-[var(--text-muted)]">total power</p>
          </div>

          {/* To Be Zeroed (subset of pending with zero=yes) */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Skull size={16} className="text-red-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-red-400">To Zero</span>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{stats.toZeroCount}</p>
            <p className="text-sm font-semibold text-[var(--text-secondary)] mt-1">{formatTotalPower(stats.toZeroPower)}</p>
            <p className="text-[10px] text-[var(--text-muted)]">total power</p>
          </div>

          {/* Zeroed */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crosshair size={16} className="text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Zeroed</span>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{stats.zeroedCount}</p>
            <p className="text-sm font-semibold text-[var(--text-secondary)] mt-1">{formatTotalPower(stats.zeroedPower)}</p>
            <p className="text-[10px] text-[var(--text-muted)]">total power</p>
          </div>

          {/* Left Kingdom */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <LogOut size={16} className="text-sky-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">Left</span>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{stats.leftCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">migrated out</p>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or governor ID..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-red-500/50"
            />
          </div>
          {/* Alliance filter */}
          {alliances.length > 0 && (
            <select
              value={allianceFilter || ''}
              onChange={(e) => setAllianceFilter(e.target.value || null)}
              className="px-3 py-2.5 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-red-500/50"
            >
              <option value="">All Alliances</option>
              {alliances.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
          {/* Zero filter */}
          <select
            value={zeroFilter}
            onChange={(e) => setZeroFilter(e.target.value as 'all' | 'yes' | 'no')}
            className="px-3 py-2.5 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-red-500/50"
          >
            <option value="all">Zero: All</option>
            <option value="yes">Zero: Yes</option>
            <option value="no">Zero: No</option>
          </select>
          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFiltersAndSort}
              className="px-3 py-2.5 rounded-xl text-sm font-medium bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>

        {/* Handled status filter chips */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'zeroed', 'left'] as const).map(s => (
            <button
              key={s}
              onClick={() => setHandledFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                handledFilter === s
                  ? s === 'all'
                    ? 'bg-[var(--foreground)]/10 border-[var(--foreground)]/30 text-[var(--foreground)]'
                    : handledBg(s)
                  : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {s === 'all' ? `All (${stats.total})` :
               s === 'pending' ? `Pending (${stats.pendingCount})` :
               s === 'zeroed' ? `Zeroed (${stats.zeroedCount})` :
               `Left (${stats.leftCount})`}
            </button>
          ))}
        </div>

        {/* Reason filter chips */}
        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setReasonFilter(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                reasonFilter === null
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              All Reasons
            </button>
            {reasons.map(r => (
              <button
                key={r}
                onClick={() => setReasonFilter(reasonFilter === r ? null : r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  reasonFilter === r
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Sort chain display */}
        {JSON.stringify(sortRules) !== JSON.stringify(DEFAULT_SORT_RULES) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-muted)]">Sorted by:</span>
            {sortRules.map((rule, idx) => (
              <span key={rule.field} className="inline-flex items-center">
                {idx > 0 && <span className="mx-1 text-[var(--text-muted)]">&rarr;</span>}
                <button
                  onClick={() => removeSortRule(rule.field)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  title={`Remove ${SORT_FIELD_LABELS[rule.field]} from sort`}
                >
                  {SORT_FIELD_LABELS[rule.field]}
                  {rule.direction === 'asc' ? '\u2191' : '\u2193'}
                  <X className="w-3 h-3 ml-0.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading wanted list...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-400">{error}</div>
      )}

      {/* Desktop table */}
      {!loading && !error && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-[var(--background-card)]">
              <tr className="border-b border-[var(--border)]">
                <SortHeader field="name" label="Name" />
                <SortHeader field="governorId" label="Gov ID" />
                <SortHeader field="power" label="Power" align="right" />
                <th className="text-center px-3 py-2 sm:py-3">
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Coords</span>
                </th>
                <SortHeader field="alliance" label="Alliance" />
                <SortHeader field="reason" label="Reason" />
                <SortHeader field="zero" label="Zero?" align="center" />
                <SortHeader field="handled" label="Handled" align="center" />
                {isOfficer && (
                  <th className="text-center px-3 py-2 sm:py-3">
                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isOfficer ? 9 : 8} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                    {hasActiveFilters ? 'No players match filters' : 'No wanted players'}
                  </td>
                </tr>
              ) : (
                filtered.map((player, idx) => {
                  const handled = getHandledStatus(player);
                  const isDone = handled !== 'pending';
                  const isIllegal = player.reason?.toLowerCase().includes('illegal');
                  return (
                    <tr
                      key={player.governorId || player.name}
                      className={`border-b border-[var(--border)] hover:bg-[var(--background-secondary)]/50 transition-colors ${idx % 2 === 0 ? 'bg-[var(--background-secondary)]/30' : ''} ${isDone ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <span className={`font-medium text-sm ${isDone ? 'line-through text-[var(--text-muted)]' : 'text-[var(--foreground)]'}`}>
                          {player.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-muted)]">
                        {player.governorId || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-[var(--foreground)]">
                        {formatPower(player.power2)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {player.x || player.y ? `${player.x}, ${player.y}` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[var(--text-secondary)]">
                        {player.alliance || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        {player.reason ? (
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-md text-xs font-medium border ${
                            isIllegal
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {player.reason}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {player.zero === 'yes' ? (
                          <span className="text-xs font-semibold text-red-400">YES</span>
                        ) : player.zero === 'no' ? (
                          <span className="text-xs font-semibold text-[var(--text-muted)]">NO</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${handledBg(handled)}`}>
                          {handled}
                        </span>
                      </td>
                      {isOfficer && (
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleMarkStatus(player.governorId, player.name, handled === 'zeroed' ? null : 'zeroed')}
                              className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                                handled === 'zeroed'
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                  : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-emerald-400 hover:border-emerald-500/40'
                              }`}
                            >
                              ZEROED
                            </button>
                            <button
                              onClick={() => handleMarkStatus(player.governorId, player.name, handled === 'left' ? null : 'left')}
                              className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                                handled === 'left'
                                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                                  : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-sky-400 hover:border-sky-500/40'
                              }`}
                            >
                              LEFT
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile card view */}
      {!loading && !error && (
        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--text-muted)] rounded-xl border border-[var(--border)]">
              {hasActiveFilters ? 'No players match filters' : 'No wanted players'}
            </div>
          ) : (
            filtered.map((player) => {
              const handled = getHandledStatus(player);
              const isDone = handled !== 'pending';
              const isIllegal = player.reason?.toLowerCase().includes('illegal');
              return (
                <div
                  key={player.governorId || player.name}
                  className={`rounded-xl border border-[var(--border)] p-4 space-y-3 ${isDone ? 'opacity-50' : ''}`}
                >
                  {/* Top row: name + handled badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-semibold text-[var(--foreground)] truncate ${isDone ? 'line-through' : ''}`}>
                        {player.name}
                      </p>
                      <p className="text-xs font-mono text-[var(--text-muted)]">
                        ID: {player.governorId || '-'}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${handledBg(handled)}`}>
                      {handled}
                    </span>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-[var(--text-muted)]">Power: </span>
                      <span className="font-mono text-[var(--text-secondary)]">{formatPower(player.power2)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Coords: </span>
                      <span className="font-mono text-[var(--text-secondary)]">{player.x || player.y ? `${player.x}, ${player.y}` : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Alliance: </span>
                      <span className="text-[var(--text-secondary)]">{player.alliance || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Zero? </span>
                      {player.zero === 'yes' ? (
                        <span className="font-semibold text-red-400">YES</span>
                      ) : player.zero === 'no' ? (
                        <span className="font-semibold text-[var(--text-muted)]">NO</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">-</span>
                      )}
                    </div>
                  </div>

                  {/* Reason */}
                  {player.reason && (
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${
                        isIllegal
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {player.reason}
                      </span>
                    </div>
                  )}

                  {/* Officer actions */}
                  {isOfficer && (
                    <div className="flex gap-2 pt-1 border-t border-[var(--border)]/50">
                      <button
                        onClick={() => handleMarkStatus(player.governorId, player.name, handled === 'zeroed' ? null : 'zeroed')}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          handled === 'zeroed'
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-emerald-400 hover:border-emerald-500/40'
                        }`}
                      >
                        ZEROED
                      </button>
                      <button
                        onClick={() => handleMarkStatus(player.governorId, player.name, handled === 'left' ? null : 'left')}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          handled === 'left'
                            ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                            : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-sky-400 hover:border-sky-500/40'
                        }`}
                      >
                        LEFT
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Showing count + last refreshed */}
      <div className="mt-3 text-xs text-[var(--text-muted)] text-center space-y-0.5">
        <div>Showing {filtered.length} of {stats.total} players</div>
        {lastRefreshed && (
          <div>Last refreshed: {lastRefreshed.toLocaleTimeString()}</div>
        )}
      </div>

      {/* Undo toast */}
      {undoAction && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-xl">
            <span className="text-sm text-[var(--text-secondary)]">
              Marked <span className="font-medium text-[var(--foreground)]">{undoAction.playerName}</span> as{' '}
              <span className="font-medium">
                {undoAction.newStatus === null ? 'pending' : undoAction.newStatus}
              </span>
            </span>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        </div>
      )}

      {/* Password modal */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Login</h2>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              placeholder="Password"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] mb-4 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 py-2 rounded-lg font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Submit
              </button>
              <button
                onClick={() => { setShowPasswordPrompt(false); setPassword(''); }}
                className="flex-1 py-2 rounded-lg font-medium bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
