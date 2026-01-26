'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Calendar, Target, Users, TrendingUp, Medal, ChevronDown, ChevronUp, ChevronRight, Search, X } from 'lucide-react';
import { getTheme } from '@/lib/guide/theme';
import { createClient } from '@/lib/supabase/client';
import { formatPower, formatDate, getMemberHistory, type RosterSnapshot } from '@/lib/supabase/use-roster-snapshots';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { AppSidebar } from '@/components/AppSidebar';

// Event configuration
const EVENT_CONFIG = {
  name: 'KP Push Challenge',
  startDate: '2026-01-12',
  endDate: '2026-01-25',
  goal: '1:1 Power to KP ratio',
  description: 'Alliance challenge to increase kill points while maintaining efficient power growth.',
};

interface MemberResult {
  name: string;
  role: string | null;
  startPower: number;
  endPower: number;
  powerGain: number;
  startKp: number;
  endKp: number;
  kpGain: number;
  startRatio: number | null; // power:kp ratio at start
  endRatio: number | null; // power:kp ratio at end
  ratioImproved: boolean; // true if end ratio is better (lower) than start ratio
}

interface EventData {
  results: MemberResult[];
  totalPowerGain: number;
  totalKpGain: number;
  allianceRatio: number | null;
  participantCount: number;
  startDate: string;
  endDate: string;
}

export default function KpPushEventPage() {
  const theme = getTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [showLeadership, setShowLeadership] = useState(true);
  const [showNonGainers, setShowNonGainers] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  // Expanded row state
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [memberSnapshots, setMemberSnapshots] = useState<RosterSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  useEffect(() => {
    async function fetchEventData() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        // Get available snapshot dates
        const { data: dates } = await supabase
          .from('roster_snapshots')
          .select('snapshot_date')
          .order('snapshot_date', { ascending: true });

        if (!dates || dates.length === 0) {
          setError('No snapshot data available');
          return;
        }

        const uniqueDates = [...new Set(dates.map(d => d.snapshot_date))];

        // Find closest dates to event start/end
        const findClosestDate = (targetDate: string, availableDates: string[], direction: 'before' | 'after') => {
          const sorted = availableDates.filter(d =>
            direction === 'before' ? d <= targetDate : d >= targetDate
          ).sort();
          return direction === 'before' ? sorted[sorted.length - 1] : sorted[0];
        };

        const actualStartDate = findClosestDate(EVENT_CONFIG.startDate, uniqueDates, 'after') || uniqueDates[0];
        const actualEndDate = findClosestDate(EVENT_CONFIG.endDate, uniqueDates, 'before') || uniqueDates[uniqueDates.length - 1];

        // Get roster with roles
        const { data: roster } = await supabase
          .from('alliance_roster')
          .select('name, role, alternate_names')
          .eq('is_active', true);

        const roleMap = new Map<string, string | null>();
        const nameVariantMap = new Map<string, string>(); // variant -> canonical name

        if (roster) {
          for (const member of roster) {
            roleMap.set(member.name, member.role);
            nameVariantMap.set(member.name, member.name);
            if (member.alternate_names && Array.isArray(member.alternate_names)) {
              for (const alt of member.alternate_names) {
                nameVariantMap.set(alt, member.name);
                roleMap.set(alt, member.role);
              }
            }
          }
        }

        // Get canonical name helper
        const getCanonicalName = (name: string) => nameVariantMap.get(name) || name;

        // Fetch ALL snapshots in the event period (and slightly before/after for fallback)
        const { data: allSnapshots } = await supabase
          .from('roster_snapshots')
          .select('member_name, power, kills, snapshot_date')
          .gte('snapshot_date', actualStartDate)
          .lte('snapshot_date', actualEndDate)
          .eq('is_active', true)
          .order('snapshot_date', { ascending: true });

        if (!allSnapshots || allSnapshots.length === 0) {
          setError('Could not fetch snapshot data');
          return;
        }

        // Group snapshots by canonical member name
        const snapshotsByMember = new Map<string, Array<{ date: string; power: number; kp: number; name: string }>>();
        for (const snap of allSnapshots) {
          const canonical = getCanonicalName(snap.member_name);
          if (!snapshotsByMember.has(canonical)) {
            snapshotsByMember.set(canonical, []);
          }
          snapshotsByMember.get(canonical)!.push({
            date: snap.snapshot_date,
            power: snap.power || 0,
            kp: snap.kills || 0,
            name: snap.member_name,
          });
        }

        // For each member, find closest valid start and end snapshots
        const startMap = new Map<string, { power: number; kp: number }>();
        const endMap = new Map<string, { power: number; kp: number; name: string }>();

        for (const [canonical, snapshots] of snapshotsByMember) {
          if (snapshots.length === 0) continue;

          // Sort by date
          snapshots.sort((a, b) => a.date.localeCompare(b.date));

          // Find closest to start date (prefer exact match, then closest after)
          let startSnap = snapshots.find(s => s.date === actualStartDate);
          if (!startSnap) {
            // Use earliest snapshot as fallback for start
            startSnap = snapshots[0];
          }

          // Find closest to end date (prefer exact match, then closest before)
          let endSnap = snapshots.find(s => s.date === actualEndDate);
          if (!endSnap) {
            // Use latest snapshot as fallback for end
            endSnap = snapshots[snapshots.length - 1];
          }

          // Only include if we have different dates (actual growth period)
          if (startSnap && endSnap && startSnap.date !== endSnap.date) {
            startMap.set(canonical, { power: startSnap.power, kp: startSnap.kp });
            endMap.set(canonical, { power: endSnap.power, kp: endSnap.kp, name: endSnap.name });
          } else if (startSnap && endSnap) {
            // Same date - still include but growth will be 0
            startMap.set(canonical, { power: startSnap.power, kp: startSnap.kp });
            endMap.set(canonical, { power: endSnap.power, kp: endSnap.kp, name: endSnap.name });
          }
        }

        // Calculate results for members present in both maps
        const results: MemberResult[] = [];
        let totalPowerGain = 0;
        let totalKpGain = 0;

        for (const [canonical, end] of endMap) {
          const start = startMap.get(canonical);
          if (!start) continue;

          const powerGain = end.power - start.power;
          const kpGain = end.kp - start.kp;

          totalPowerGain += Math.max(0, powerGain);
          totalKpGain += Math.max(0, kpGain);

          // Calculate Power:KP ratios at start and end
          const startRatio = start.kp > 0 ? start.power / start.kp : null;
          const endRatio = end.kp > 0 ? end.power / end.kp : null;
          // Ratio improved if end ratio is lower (more KP per power = better)
          const ratioImproved = startRatio !== null && endRatio !== null && endRatio < startRatio;

          results.push({
            name: end.name,
            role: roleMap.get(canonical) || roleMap.get(end.name) || null,
            startPower: start.power,
            endPower: end.power,
            powerGain,
            startKp: start.kp,
            endKp: end.kp,
            kpGain,
            startRatio,
            endRatio,
            ratioImproved,
          });
        }

        const allianceRatio = totalKpGain > 0 ? totalPowerGain / totalKpGain : null;
        const participantCount = results.filter(r => r.kpGain > 0).length;

        setEventData({
          results,
          totalPowerGain,
          totalKpGain,
          allianceRatio,
          participantCount,
          startDate: actualStartDate,
          endDate: actualEndDate,
        });
      } catch (err) {
        console.error('Error fetching event data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch event data');
      } finally {
        setLoading(false);
      }
    }

    fetchEventData();
  }, []);

  // Load member snapshots when expanded
  const handleExpandMember = async (memberName: string) => {
    if (expandedMember === memberName) {
      setExpandedMember(null);
      setMemberSnapshots([]);
      return;
    }

    setExpandedMember(memberName);
    setLoadingSnapshots(true);

    try {
      const history = await getMemberHistory(memberName, 30);
      setMemberSnapshots(history);
    } catch (err) {
      console.error('Error loading member history:', err);
      setMemberSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  // Search filter helper
  const matchesSearch = (name: string) => {
    if (!searchQuery.trim()) return true;
    return name.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  // Separate results into categories (with search filter applied)
  const rankedMembers = eventData?.results
    .filter(r => r.kpGain > 0 && r.role !== 'R4' && r.role !== 'R5' && matchesSearch(r.name))
    .sort((a, b) => b.kpGain - a.kpGain) || [];

  const leadership = eventData?.results
    .filter(r => (r.role === 'R4' || r.role === 'R5') && matchesSearch(r.name))
    .sort((a, b) => b.kpGain - a.kpGain) || [];

  const nonGainers = eventData?.results
    .filter(r => r.kpGain <= 0 && r.role !== 'R4' && r.role !== 'R5' && matchesSearch(r.name))
    .sort((a, b) => a.kpGain - b.kpGain) || [];

  // Reset pagination when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(0);
  };

  // Pagination
  const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(rankedMembers.length / rowsPerPage);
  const paginatedMembers = rowsPerPage === -1
    ? rankedMembers
    : rankedMembers.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

  // Format Power/KP ratio as a simple number (e.g., "42.5" meaning 42.5 power per 1 KP)
  const formatPowerKpRatio = (power: number, kp: number): string => {
    if (kp === 0) return '-';
    const ratio = power / kp;
    return ratio.toFixed(1);
  };

  // Format growth value with proper sign prefix
  const formatGrowth = (value: number): string => {
    if (value > 0) return '+' + formatPower(value);
    if (value < 0) return formatPower(value); // formatPower handles negative sign
    return '0';
  };

  // Format a computed ratio for alliance summary (gains ratio)
  const formatGainsRatio = (ratio: number | null): string => {
    if (ratio === null) return '-';
    if (ratio === Infinity) return '∞';
    return ratio.toFixed(1) + ':1';
  };

  const getRankBadge = (index: number, globalIndex: number) => {
    if (globalIndex === 0) return <span className="text-amber-400">🥇</span>;
    if (globalIndex === 1) return <span className="text-gray-300">🥈</span>;
    if (globalIndex === 2) return <span className="text-amber-600">🥉</span>;
    return <span className="text-[var(--text-muted)] w-6 inline-block text-center">{globalIndex + 1}</span>;
  };

  if (loading) {
    return (
      <AppSidebar>
        <div className="min-h-screen bg-[var(--background)] text-[var(--text)] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className={theme.textMuted}>Loading event data...</p>
          </div>
        </div>
      </AppSidebar>
    );
  }

  if (error) {
    return (
      <AppSidebar>
        <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className={`${theme.card} border border-red-500/30 rounded-lg p-8 text-center`}>
              <p className="text-red-400 mb-4">{error}</p>
              <Link href="/events" className="text-emerald-400 hover:underline">
                Back to Events
              </Link>
            </div>
          </div>
        </div>
      </AppSidebar>
    );
  }

  return (
    <AppSidebar>
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
        <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/events"
          className={`inline-flex items-center gap-2 text-sm ${theme.textMuted} hover:text-white mb-6`}
        >
          <ArrowLeft size={16} />
          Back to Events
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Trophy size={28} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{EVENT_CONFIG.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
                  Completed
                </span>
                <span className={`flex items-center gap-1 text-sm ${theme.textMuted}`}>
                  <Calendar size={14} />
                  {eventData?.startDate} to {eventData?.endDate}
                </span>
              </div>
            </div>
          </div>
          <p className={theme.textMuted}>{EVENT_CONFIG.description}</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className={`${theme.card} border rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-red-400" />
              <span className={`text-sm ${theme.textMuted}`}>Total KP Gained</span>
            </div>
            <p className="text-2xl font-bold text-red-400">
              {formatPower(eventData?.totalKpGain || 0)}
            </p>
          </div>

          <div className={`${theme.card} border rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-blue-400" />
              <span className={`text-sm ${theme.textMuted}`}>Total Power Change</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {formatPower(eventData?.totalPowerGain || 0)}
            </p>
          </div>

          <div className={`${theme.card} border rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Target size={18} className={eventData?.allianceRatio && eventData.allianceRatio <= 1 ? 'text-green-400' : 'text-amber-400'} />
              <span className={`text-sm ${theme.textMuted}`}>Alliance Ratio</span>
            </div>
            <p className={`text-2xl font-bold ${eventData?.allianceRatio && eventData.allianceRatio <= 1 ? 'text-green-400' : 'text-amber-400'}`}>
              {formatGainsRatio(eventData?.allianceRatio || null)}
            </p>
            <p className={`text-xs ${theme.textMuted}`}>Goal: ≤1:1</p>
          </div>

          <div className={`${theme.card} border rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} className="text-purple-400" />
              <span className={`text-sm ${theme.textMuted}`}>Participants</span>
            </div>
            <p className="text-2xl font-bold text-purple-400">
              {eventData?.participantCount || 0}
            </p>
            <p className={`text-xs ${theme.textMuted}`}>gained KP</p>
          </div>
        </div>

        {/* Search */}
        <div className={`${theme.card} border rounded-lg p-4 mb-6`}>
          <div className="relative">
            <Search size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={`w-full pl-10 pr-10 py-2 rounded-lg border ${theme.input} text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${theme.textMuted} hover:text-white`}
              >
                <X size={18} />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className={`text-sm ${theme.textMuted} mt-2`}>
              Found {rankedMembers.length + leadership.length + nonGainers.length} member{rankedMembers.length + leadership.length + nonGainers.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
            </p>
          )}
        </div>

        {/* Leaderboard */}
        <div className={`${theme.card} border rounded-lg overflow-hidden mb-6`}>
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Medal size={20} className="text-amber-400" />
              <h2 className="text-lg font-semibold">Rankings</h2>
              <span className={`text-sm ${theme.textMuted}`}>({rankedMembers.length} members)</span>
            </div>
            <p className={`text-xs ${theme.textMuted} mt-1`}>Excludes R4/R5 leadership. Click a row to view snapshot history.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`${theme.card} border-b border-[var(--border)]`}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-8"></th>
                  <th className="px-4 py-3 text-left font-medium">Rank</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">KP Gained</th>
                  <th className="px-4 py-3 text-right font-medium">Power Change</th>
                  <th className="px-4 py-3 text-right font-medium">Start P/KP</th>
                  <th className="px-4 py-3 text-right font-medium">End P/KP</th>
                  <th className="px-4 py-3 text-center font-medium">Improved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedMembers.map((member, index) => {
                  const globalIndex = rowsPerPage === -1 ? index : currentPage * rowsPerPage + index;
                  const isExpanded = expandedMember === member.name;

                  return (
                    <>
                      <tr
                        key={member.name}
                        className={`hover:bg-[var(--background-secondary)] cursor-pointer ${isExpanded ? 'bg-[var(--background-secondary)]' : ''}`}
                        onClick={() => handleExpandMember(member.name)}
                      >
                        <td className="px-4 py-3">
                          <ChevronRight
                            size={16}
                            className={`transition-transform ${isExpanded ? 'rotate-90' : ''} ${theme.textMuted}`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {getRankBadge(index, globalIndex)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {member.name}
                          {member.role && (
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                              member.role === 'R3' ? 'bg-blue-500/20 text-blue-400' :
                              member.role === 'R2' ? 'bg-green-500/20 text-green-400' :
                              'bg-[var(--background-secondary)] text-[var(--text-muted)]'
                            }`}>
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-red-400 font-medium">
                          {formatGrowth(member.kpGain)}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-400">
                          {formatGrowth(member.powerGain)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPowerKpRatio(member.startPower, member.startKp)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPowerKpRatio(member.endPower, member.endKp)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {member.ratioImproved ? (
                            <span className="text-green-400">✓</span>
                          ) : (
                            <span className="text-red-400">✗</span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded row with snapshot history */}
                      {isExpanded && (
                        <tr className="bg-[var(--background-secondary)]/50">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="ml-8">
                              <h4 className={`text-sm font-semibold mb-3 ${theme.textMuted}`}>
                                Snapshot History for {member.name}
                              </h4>
                              {loadingSnapshots ? (
                                <div className={`text-sm ${theme.textMuted}`}>Loading...</div>
                              ) : memberSnapshots.length === 0 ? (
                                <div className={`text-sm ${theme.textMuted}`}>No snapshot history found</div>
                              ) : (
                                <div className="flex flex-col md:flex-row gap-4">
                                  {/* Snapshot History Table */}
                                  <div className="flex-1 overflow-x-auto">
                                    <table className="text-xs sm:text-sm">
                                      <thead>
                                        <tr className={`border-b border-[var(--border)] ${theme.textMuted}`}>
                                          <th className="text-left px-2 py-1">Date</th>
                                          <th className="text-right px-2 py-1">Power</th>
                                          <th className="text-right px-2 py-1">KP</th>
                                          <th className="text-right px-2 py-1">T4</th>
                                          <th className="text-right px-2 py-1">T5</th>
                                          <th className="text-right px-2 py-1">Honor</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {memberSnapshots.map((snap, snapIdx) => {
                                          const prevSnap = snapIdx > 0 ? memberSnapshots[snapIdx - 1] : null;
                                          const isCarryover = (current: number | undefined, prev: number | undefined) =>
                                            prevSnap && current === prev;

                                          const carryoverClass = "opacity-40 italic";
                                          const powerCarry = isCarryover(snap.power, prevSnap?.power);
                                          const killsCarry = isCarryover(snap.kills, prevSnap?.kills);
                                          const t4Carry = isCarryover(snap.t4_kills, prevSnap?.t4_kills);
                                          const t5Carry = isCarryover(snap.t5_kills, prevSnap?.t5_kills);
                                          const honorCarry = isCarryover(snap.honor_points, prevSnap?.honor_points);

                                          return (
                                            <tr key={snap.id || snapIdx} className="border-b border-[var(--border)]/30">
                                              <td className="px-2 py-1 text-[#9f7aea]">
                                                {formatDate(snap.snapshot_date)}
                                              </td>
                                              <td className={`px-2 py-1 text-right text-[#01b574] ${powerCarry ? carryoverClass : ''}`}>
                                                {formatPower(snap.power)}
                                              </td>
                                              <td className={`px-2 py-1 text-right text-[#f56565] ${killsCarry ? carryoverClass : ''}`}>
                                                {formatPower(snap.kills)}
                                              </td>
                                              <td className={`px-2 py-1 text-right text-[#fbbf24] ${t4Carry ? carryoverClass : ''}`}>
                                                {formatPower(snap.t4_kills)}
                                              </td>
                                              <td className={`px-2 py-1 text-right text-[#f97316] ${t5Carry ? carryoverClass : ''}`}>
                                                {formatPower(snap.t5_kills)}
                                              </td>
                                              <td className={`px-2 py-1 text-right text-[#fbbf24] ${honorCarry ? carryoverClass : ''}`}>
                                                {snap.honor_points?.toLocaleString() || '-'}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    <div className={`text-[10px] ${theme.textMuted} mt-2 italic`}>
                                      Dimmed values are unchanged from previous snapshot
                                    </div>
                                  </div>
                                  {/* Growth Sparkline Charts - 2x2 grid to the right */}
                                  {memberSnapshots.length >= 2 && (
                                    <div className="md:w-64 shrink-0">
                                      <div className={`text-xs ${theme.textMuted} mb-2`}>Growth Trends</div>
                                      <div className="grid grid-cols-2 gap-2">
                                        {/* Power Sparkline */}
                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                          <div style={{ height: 45 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={memberSnapshots.map(s => ({ v: s.power }))} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                <Line type="monotone" dataKey="v" stroke="#01b574" strokeWidth={1.5} dot={false} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                          <div className={`text-[10px] ${theme.textMuted} mt-1`}>Power</div>
                                        </div>
                                        {/* KP Sparkline */}
                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                          <div style={{ height: 45 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={memberSnapshots.map(s => ({ v: s.kills || 0 }))} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                <Line type="monotone" dataKey="v" stroke="#f56565" strokeWidth={1.5} dot={false} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                          <div className={`text-[10px] ${theme.textMuted} mt-1`}>Kill Points</div>
                                        </div>
                                        {/* T4 Sparkline */}
                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                          <div style={{ height: 45 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={memberSnapshots.map(s => ({ v: s.t4_kills || 0 }))} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                <Line type="monotone" dataKey="v" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                          <div className={`text-[10px] ${theme.textMuted} mt-1`}>T4 KP</div>
                                        </div>
                                        {/* T5 Sparkline */}
                                        <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                          <div style={{ height: 45 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={memberSnapshots.map(s => ({ v: s.t5_kills || 0 }))} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                <Line type="monotone" dataKey="v" stroke="#f97316" strokeWidth={1.5} dot={false} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                          <div className={`text-[10px] ${theme.textMuted} mt-1`}>T5 KP</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div className="p-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${theme.textMuted}`}>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(0);
                }}
                className={`text-sm px-2 py-1 rounded border ${theme.input}`}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={-1}>All</option>
              </select>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className={theme.textMuted}>
                {rowsPerPage === -1
                  ? `Showing all ${rankedMembers.length} members`
                  : `Showing ${Math.min(currentPage * rowsPerPage + 1, rankedMembers.length)}-${Math.min((currentPage + 1) * rowsPerPage, rankedMembers.length)} of ${rankedMembers.length}`
                }
              </span>
              {rowsPerPage !== -1 && totalPages > 1 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className={`px-3 py-1 rounded ${theme.button} disabled:opacity-50`}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className={`px-3 py-1 rounded ${theme.button} disabled:opacity-50`}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Leadership Section */}
        {leadership.length > 0 && (
          <div className={`${theme.card} border rounded-lg overflow-hidden mb-6`}>
            <button
              onClick={() => setShowLeadership(!showLeadership)}
              className="w-full p-4 border-b border-[var(--border)] flex items-center justify-between hover:bg-[var(--background-secondary)]"
            >
              <div className="flex items-center gap-2">
                <Users size={20} className="text-purple-400" />
                <h2 className="text-lg font-semibold">Leadership (R4/R5)</h2>
                <span className={`text-sm ${theme.textMuted}`}>({leadership.length})</span>
              </div>
              {showLeadership ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showLeadership && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={`${theme.card} border-b border-[var(--border)]`}>
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium">Role</th>
                      <th className="px-4 py-3 text-right font-medium">KP Gained</th>
                      <th className="px-4 py-3 text-right font-medium">Power Change</th>
                      <th className="px-4 py-3 text-right font-medium">Start P/KP</th>
                      <th className="px-4 py-3 text-right font-medium">End P/KP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {leadership.map((member) => (
                      <tr key={member.name} className="hover:bg-[var(--background-secondary)]">
                        <td className="px-4 py-3 font-medium">{member.name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            member.role === 'R5' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-purple-500/20 text-purple-400'
                          }`}>
                            {member.role}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right ${member.kpGain > 0 ? 'text-red-400' : theme.textMuted}`}>
                          {formatGrowth(member.kpGain)}
                        </td>
                        <td className={`px-4 py-3 text-right ${member.powerGain > 0 ? 'text-blue-400' : theme.textMuted}`}>
                          {formatGrowth(member.powerGain)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPowerKpRatio(member.startPower, member.startKp)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPowerKpRatio(member.endPower, member.endKp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Non-Gainers Section */}
        {nonGainers.length > 0 && (
          <div className={`${theme.card} border rounded-lg overflow-hidden`}>
            <button
              onClick={() => setShowNonGainers(!showNonGainers)}
              className="w-full p-4 border-b border-[var(--border)] flex items-center justify-between hover:bg-[var(--background-secondary)]"
            >
              <div className="flex items-center gap-2">
                <Users size={20} className={theme.textMuted} />
                <h2 className="text-lg font-semibold">No KP Gain</h2>
                <span className={`text-sm ${theme.textMuted}`}>({nonGainers.length})</span>
              </div>
              {showNonGainers ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showNonGainers && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={`${theme.card} border-b border-[var(--border)]`}>
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-right font-medium">KP Change</th>
                      <th className="px-4 py-3 text-right font-medium">Power Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {nonGainers.map((member) => (
                      <tr key={member.name} className="hover:bg-[var(--background-secondary)]">
                        <td className="px-4 py-3 font-medium">
                          {member.name}
                          {member.role && (
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded bg-[var(--background-secondary)] text-[var(--text-muted)]`}>
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right ${theme.textMuted}`}>
                          {formatGrowth(member.kpGain)}
                        </td>
                        <td className={`px-4 py-3 text-right ${member.powerGain > 0 ? 'text-blue-400' : theme.textMuted}`}>
                          {formatGrowth(member.powerGain)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </AppSidebar>
  );
}
