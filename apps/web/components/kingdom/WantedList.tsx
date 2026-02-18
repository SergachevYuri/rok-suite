'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, RefreshCw, Lock, ExternalLink, Crosshair, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchWantedSheet } from '@/lib/kingdom/parse';
import { WANTED_SHEET_URL, WANTED_SHEET_EDIT_URL, formatNumber } from '@/lib/kingdom/config';
import { matchesSearch } from '@/lib/search';
import type { WantedPlayer } from '@/lib/kingdom/types';

type OfficerMark = 'zeroed' | 'left';

interface WantedStatus {
  governor_id: number;
  status: OfficerMark;
  updated_at: string;
}

const OFFICER_PASSWORD = 'angmar';
const ADMIN_PASSWORD = 'carn-dum';

export default function WantedList() {
  const [players, setPlayers] = useState<WantedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [handledFilter, setHandledFilter] = useState<'all' | 'pending' | 'zeroed' | 'left'>('all');

  // Officer mode (can change handled status)
  const [isOfficer, setIsOfficer] = useState(false);
  // Admin mode (can see sheet link) — admin also gets officer privileges
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  // Supabase officer marks
  const [officerMarks, setOfficerMarks] = useState<Map<number, OfficerMark>>(new Map());

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

  const handleMarkStatus = async (governorId: number, status: OfficerMark | null) => {
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
  };

  // Officer handling status: zeroed, left, or pending (not yet handled)
  const getHandledStatus = (player: WantedPlayer): 'pending' | 'zeroed' | 'left' => {
    return officerMarks.get(player.governorId) || 'pending';
  };

  // Unique reasons for filter chips
  const reasons = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      if (p.reason) set.add(p.reason);
    }
    return [...set].sort();
  }, [players]);

  // Filtered players
  const filtered = useMemo(() => {
    return players.filter(p => {
      if (search && !matchesSearch(search, p.name, p.governorId)) return false;
      if (reasonFilter && p.reason !== reasonFilter) return false;
      const handled = getHandledStatus(p);
      if (handledFilter !== 'all' && handled !== handledFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, search, reasonFilter, handledFilter, officerMarks]);

  // Counts
  const counts = useMemo(() => {
    let pending = 0, zeroed = 0, left = 0;
    for (const p of players) {
      const s = getHandledStatus(p);
      if (s === 'pending') pending++;
      else if (s === 'zeroed') zeroed++;
      else left++;
    }
    return { total: players.length, pending, zeroed, left };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, officerMarks]);

  const handledColor = (status: 'pending' | 'zeroed' | 'left') => {
    switch (status) {
      case 'pending': return 'text-amber-400';
      case 'zeroed': return 'text-emerald-400';
      case 'left': return 'text-sky-400';
    }
  };

  const handledBg = (status: 'pending' | 'zeroed' | 'left') => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'zeroed': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'left': return 'bg-sky-500/10 border-sky-500/30 text-sky-400';
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/10">
            <Crosshair className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Wanted</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {counts.total} players &middot; {counts.pending} pending &middot; {counts.zeroed} zeroed &middot; {counts.left} left
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {!isOfficer && (
            <button
              onClick={() => setShowPasswordPrompt(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              <Lock size={16} />
              Login
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
              Edit Sheet
            </a>
          )}
        </div>
      </div>

      {/* Officer/Admin mode banner */}
      {isOfficer && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <Lock size={14} />
            <span className="font-medium">{isAdmin ? 'Admin Mode' : 'Officer Mode'}</span>
            <span className="text-amber-400/60">&mdash; Mark players as zeroed or left kingdom</span>
          </div>
          <button
            onClick={() => { setIsOfficer(false); setIsAdmin(false); }}
            className="text-amber-400/60 hover:text-amber-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search + filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or governor ID..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-red-500/50"
          />
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
              {s === 'all' ? `All (${counts.total})` :
               s === 'pending' ? `Pending (${counts.pending})` :
               s === 'zeroed' ? `Zeroed (${counts.zeroed})` :
               `Left (${counts.left})`}
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
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading wanted list...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-400">{error}</div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--background-secondary)] border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Gov ID</th>
                  <th className="text-right px-4 py-3 font-semibold text-[var(--text-muted)]">Power</th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--text-muted)]">Coords</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Alliance</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Reason</th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--text-muted)]">Zero?</th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--text-muted)]">Handled</th>
                  {isOfficer && (
                    <th className="text-center px-4 py-3 font-semibold text-[var(--text-muted)]">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isOfficer ? 9 : 8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      {search || reasonFilter || handledFilter !== 'all' ? 'No players match filters' : 'No wanted players'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((player) => {
                    const handled = getHandledStatus(player);
                    const isDone = handled !== 'pending';
                    return (
                      <tr
                        key={player.governorId || player.name}
                        className={`border-b border-[var(--border)]/50 hover:bg-[var(--background-secondary)]/50 transition-colors ${isDone ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`font-medium ${isDone ? 'line-through' : ''}`}>
                            {player.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--text-muted)]">
                          {player.governorId || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">
                          {player.power2 ? formatNumber(player.power2) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-[var(--text-muted)]">
                          {player.x || player.y ? `${player.x}, ${player.y}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {player.alliance || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {player.reason ? (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              {player.reason}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {player.zero === 'yes' ? (
                            <span className="text-xs font-semibold text-red-400">YES</span>
                          ) : player.zero === 'no' ? (
                            <span className="text-xs font-semibold text-[var(--text-muted)]">NO</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold uppercase ${handledColor(handled)}`}>
                            {handled}
                          </span>
                        </td>
                        {isOfficer && (
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleMarkStatus(player.governorId, handled === 'zeroed' ? null : 'zeroed')}
                                className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                                  handled === 'zeroed'
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                    : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-emerald-400 hover:border-emerald-500/40'
                                }`}
                              >
                                ZEROED
                              </button>
                              <button
                                onClick={() => handleMarkStatus(player.governorId, handled === 'left' ? null : 'left')}
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
        </div>
      )}

      {/* Last refreshed */}
      {lastRefreshed && (
        <div className="mt-3 text-xs text-[var(--text-muted)] text-center">
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
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
