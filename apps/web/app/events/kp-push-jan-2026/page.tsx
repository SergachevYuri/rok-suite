'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Calendar, Target, Users, TrendingUp, Medal, ChevronDown, ChevronUp, ChevronRight, Search, X } from 'lucide-react';
import { getTheme } from '@/lib/guide/theme';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { formatPower, formatDate, getMemberHistory, type RosterSnapshot } from '@/lib/supabase/use-roster-snapshots';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ScatterChart, Scatter, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AppSidebar } from '@/components/AppSidebar';

// Event configuration
const EVENT_CONFIG = {
  name: 'KP Push Challenge',
  startDate: '2026-01-12',
  endDate: '2026-01-27',
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

type EventSortField = 'rank' | 'name' | 'kpGain' | 'powerGain' | 'ratio';
type SortDirection = 'asc' | 'desc';

function compareMembersByField(
  a: MemberResult, b: MemberResult,
  field: EventSortField, direction: SortDirection,
  baseOrder: Map<string, number>
): number {
  let aVal: number | string = 0;
  let bVal: number | string = 0;
  switch (field) {
    case 'rank': aVal = baseOrder.get(a.name) ?? 999; bVal = baseOrder.get(b.name) ?? 999; break;
    case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
    case 'kpGain': aVal = a.kpGain; bVal = b.kpGain; break;
    case 'powerGain': aVal = a.powerGain; bVal = b.powerGain; break;
    case 'ratio': aVal = a.endRatio ?? -1; bVal = b.endRatio ?? -1; break;
  }
  if (direction === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
  return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
}

export default function KpPushEventPage() {
  const theme = getTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [showLeadership, setShowLeadership] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state
  const [sortField, setSortField] = useState<EventSortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [leaderSortField, setLeaderSortField] = useState<EventSortField>('kpGain');
  const [leaderSortDirection, setLeaderSortDirection] = useState<SortDirection>('desc');

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
        const dates = await fetchAllRows<{ snapshot_date: string }>((range) =>
          supabase
            .from('roster_snapshots')
            .select('snapshot_date')
            .order('snapshot_date', { ascending: true })
            .range(range.from, range.to)
        );

        if (dates.length === 0) {
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

        // Fetch snapshots for start and end dates using pagination
        const allSnapshots = await fetchAllRows<{
          member_name: string; power: number; kills: number; snapshot_date: string;
        }>((range) =>
          supabase
            .from('roster_snapshots')
            .select('member_name, power, kills, snapshot_date')
            .in('snapshot_date', [actualStartDate, actualEndDate])
            .eq('is_active', true)
            .order('snapshot_date', { ascending: true })
            .range(range.from, range.to)
        );

        if (allSnapshots.length === 0) {
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

          // Only include members who have snapshots on both different dates
          // Members with only one snapshot date weren't present for the full event period
          if (startSnap && endSnap && startSnap.date !== endSnap.date) {
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

          // Calculate KP:Power ratios at start and end (higher = more KP per power = better)
          const startRatio = start.power > 0 ? start.kp / start.power : null;
          const endRatio = end.power > 0 ? end.kp / end.power : null;
          // Ratio improved if end ratio is higher (more KP per power = better)
          const ratioImproved = startRatio !== null && endRatio !== null && endRatio > startRatio;

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

        const allianceRatio = totalPowerGain > 0 ? totalKpGain / totalPowerGain : null;
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
  // Base order is always by KP gain desc (used for rank badges)
  const rankedByKp = (eventData?.results ?? [])
    .filter(r => r.kpGain > 0 && r.role !== 'R4' && r.role !== 'R5' && matchesSearch(r.name))
    .sort((a, b) => b.kpGain - a.kpGain);
  const rankOrder = new Map(rankedByKp.map((m, i) => [m.name, i]));
  const rankedMembers = [...rankedByKp].sort((a, b) =>
    compareMembersByField(a, b, sortField, sortDirection, rankOrder)
  );

  const leadershipByKp = (eventData?.results ?? [])
    .filter(r => (r.role === 'R4' || r.role === 'R5') && matchesSearch(r.name))
    .sort((a, b) => b.kpGain - a.kpGain);
  const leaderRankOrder = new Map(leadershipByKp.map((m, i) => [m.name, i]));
  const leadership = [...leadershipByKp].sort((a, b) =>
    compareMembersByField(a, b, leaderSortField, leaderSortDirection, leaderRankOrder)
  );


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

  // Max values for bar scaling
  const maxKpGain = rankedMembers.length > 0 ? Math.max(...rankedMembers.map(r => r.kpGain)) : 1;
  const maxPowerGain = rankedMembers.length > 0 ? Math.max(...rankedMembers.map(r => Math.abs(r.powerGain))) : 1;
  const maxEndRatio = rankedMembers.length > 0 ? Math.max(...rankedMembers.filter(r => r.endRatio !== null).map(r => r.endRatio!)) : 1;

  // Ratio change helper: positive = improved (ratio went up = more KP per power)
  const getRatioChange = (member: MemberResult) => {
    if (member.startRatio === null || member.endRatio === null) return null;
    return member.endRatio - member.startRatio; // positive = improved
  };

  // Best ratio improver (among ranked members with valid ratios)
  const bestRatioImprover = rankedMembers
    .filter(r => r.startRatio !== null && r.endRatio !== null)
    .sort((a, b) => (getRatioChange(b) ?? 0) - (getRatioChange(a) ?? 0))[0] || null;

  // Format ratio value
  const formatRatio = (ratio: number | null): string => {
    if (ratio === null) return '-';
    return ratio.toFixed(1);
  };

  // Format growth value with proper sign prefix
  const formatGrowth = (value: number): string => {
    if (value > 0) return '+' + formatPower(value);
    if (value < 0) return formatPower(value); // formatPower handles negative sign
    return '0';
  };

  const handleSort = (field: EventSortField, table: 'rankings' | 'leadership') => {
    if (table === 'rankings') {
      if (sortField === field) {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSortField(field);
        setSortDirection(field === 'name' || field === 'rank' ? 'asc' : 'desc');
      }
      setCurrentPage(0);
    } else {
      if (leaderSortField === field) {
        setLeaderSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setLeaderSortField(field);
        setLeaderSortDirection(field === 'name' ? 'asc' : 'desc');
      }
    }
  };

  const sortIcon = (field: EventSortField, table: 'rankings' | 'leadership') => {
    const af = table === 'rankings' ? sortField : leaderSortField;
    const ad = table === 'rankings' ? sortDirection : leaderSortDirection;
    const active = af === field;
    const Icon = active && ad === 'desc' ? ChevronDown : ChevronUp;
    return <Icon className={`w-3.5 h-3.5 inline-block ml-0.5 ${active ? 'opacity-100' : 'opacity-30'}`} />;
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
              <TrendingUp size={18} className="text-[#f6993f]" />
              <span className={`text-sm ${theme.textMuted}`}>Total KP Gained</span>
            </div>
            <p className="text-2xl font-bold text-[#f6993f]">
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
              <Trophy size={18} className="text-amber-400" />
              <span className={`text-sm ${theme.textMuted}`}>Top Performer</span>
            </div>
            <p className="text-lg font-bold text-amber-400 truncate">
              {rankedMembers[0]?.name || '-'}
            </p>
            <p className={`text-xs ${theme.textMuted}`}>
              {rankedMembers[0] ? `+${formatPower(rankedMembers[0].kpGain)} KP` : '-'}
            </p>
          </div>

          <div className={`${theme.card} border rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Target size={18} className="text-green-400" />
              <span className={`text-sm ${theme.textMuted}`}>Best Ratio Gain</span>
            </div>
            <p className="text-lg font-bold text-green-400 truncate">
              {bestRatioImprover?.name || '-'}
            </p>
            <p className={`text-xs ${theme.textMuted}`}>
              {bestRatioImprover ? `${formatRatio(bestRatioImprover.startRatio)} → ${formatRatio(bestRatioImprover.endRatio)}` : '-'}
            </p>
          </div>
        </div>

        {/* Top 3 Podium */}
        {rankedMembers.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {rankedMembers.slice(0, 3).map((member, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const borderColors = ['border-amber-400/60', 'border-gray-400/60', 'border-amber-600/60'];
              const bgColors = ['bg-amber-400/5', 'bg-gray-400/5', 'bg-amber-600/5'];
              const textColors = ['text-amber-400', 'text-gray-300', 'text-amber-600'];
              return (
                <div
                  key={member.name}
                  className={`${theme.card} border-2 ${borderColors[i]} ${bgColors[i]} rounded-lg p-5 text-center`}
                >
                  <div className="text-3xl mb-2">{medals[i]}</div>
                  <div className="text-lg font-bold mb-1 truncate">{member.name}</div>
                  {member.role && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      member.role === 'R3' ? 'bg-blue-500/20 text-blue-400' :
                      member.role === 'R2' ? 'bg-green-500/20 text-green-400' :
                      'bg-[var(--background-secondary)] text-[var(--text-muted)]'
                    }`}>
                      {member.role}
                    </span>
                  )}
                  <div className={`text-2xl font-bold ${textColors[i]} mt-3`}>
                    +{formatPower(member.kpGain)}
                  </div>
                  <div className={`text-xs ${theme.textMuted} mt-1`}>KP Gained</div>
                  <div className="flex justify-center gap-4 mt-3 text-xs">
                    <div>
                      <span className={theme.textMuted}>Power </span>
                      <span className="text-blue-400">{formatGrowth(member.powerGain)}</span>
                    </div>
                    <div>
                      <span className={theme.textMuted}>Ratio </span>
                      {member.startRatio !== null && member.endRatio !== null ? (
                        <span className={member.ratioImproved ? 'text-green-400' : 'text-red-400'}>
                          {formatRatio(member.startRatio)} → {formatRatio(member.endRatio)}
                        </span>
                      ) : (
                        <span className={theme.textMuted}>-</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* KP Distribution Chart */}
        {rankedMembers.length > 0 && !searchQuery && (
          <div className={`${theme.card} border rounded-lg p-4 mb-6`}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-[#f6993f]" />
              <span className={`text-sm font-medium`}>KP Gain Distribution</span>
              <span className={`text-xs ${theme.textMuted}`}>({rankedMembers.length} members)</span>
            </div>
            {(() => {
              // Build histogram buckets
              const maxGain = rankedMembers.length > 0 ? Math.max(...rankedMembers.map(r => r.kpGain)) : 0;
              const bucketSize = maxGain > 0 ? Math.ceil(maxGain / 1e6 / 10) * 1e6 : 50e6;
              const bucketCount = Math.min(12, Math.max(5, Math.ceil(maxGain / bucketSize)));
              const buckets: Array<{ label: string; shortLabel: string; count: number; from: number; to: number }> = [];
              for (let i = 0; i < bucketCount; i++) {
                const from = i * bucketSize;
                const to = (i + 1) * bucketSize;
                const count = rankedMembers.filter(r => r.kpGain >= from && r.kpGain < to).length;
                buckets.push({
                  label: `${formatPower(from)} – ${formatPower(to)}`,
                  shortLabel: formatPower(from),
                  count,
                  from,
                  to,
                });
              }
              const overflow = rankedMembers.filter(r => r.kpGain >= bucketCount * bucketSize).length;
              if (overflow > 0 && buckets.length > 0) buckets[buckets.length - 1].count += overflow;
              while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop();

              return (
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buckets} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ color: 'var(--text)' }}
                        formatter={(value: any) => [`${value} member${value !== 1 ? 's' : ''}`, 'Count']}
                        labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.label ?? ''}
                      />
                      <Bar dataKey="count" fill="#f6993f" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>
        )}

        {/* Analytics Charts Row */}
        {rankedMembers.length > 0 && !searchQuery && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* KP vs Power Scatter Plot */}
            <div className={`${theme.card} border rounded-lg p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-emerald-400" />
                <span className="text-sm font-medium">KP Gain vs Power Change</span>
              </div>
              <p className={`text-[10px] ${theme.textMuted} mb-2`}>Each dot is a member. Top-left = efficient KP farmer (high KP, low power growth)</p>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      dataKey="power"
                      name="Power Change"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatPower(v)}
                      label={{ value: 'Power Change', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--text-muted)' }}
                    />
                    <YAxis
                      type="number"
                      dataKey="kp"
                      name="KP Gained"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatPower(v)}
                      width={48}
                      label={{ value: 'KP Gained', angle: -90, position: 'insideLeft', offset: 8, fontSize: 10, fill: 'var(--text-muted)' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: any, name: any) => [formatPower(value as number), name === 'kp' ? 'KP Gained' : 'Power Change']}
                      labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.name ?? ''}
                    />
                    <Scatter
                      data={rankedMembers.map(m => ({ name: m.name, power: m.powerGain, kp: m.kpGain, role: m.role }))}
                      fill="#f6993f"
                    >
                      {rankedMembers.map((m, i) => {
                        const rank = rankOrder.get(m.name) ?? i;
                        const color = rank === 0 ? '#fbbf24' : rank === 1 ? '#9ca3af' : rank === 2 ? '#cd7f32' : '#f6993f';
                        return <Cell key={m.name} fill={color} fillOpacity={rank < 3 ? 1 : 0.6} />;
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top 10 KP Gainers Horizontal Bar Chart */}
            <div className={`${theme.card} border rounded-lg p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={16} className="text-amber-400" />
                <span className="text-sm font-medium">Top 10 KP Gainers</span>
              </div>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rankedByKp.slice(0, 10).map(m => ({
                      name: m.name.length > 12 ? m.name.slice(0, 11) + '…' : m.name,
                      fullName: m.name,
                      kp: m.kpGain,
                    }))}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatPower(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: any) => [`+${formatPower(value as number)}`, 'KP Gained']}
                      labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ''}
                    />
                    <Bar dataKey="kp" radius={[0, 4, 4, 0]}>
                      {rankedByKp.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : '#f6993f'} fillOpacity={i < 3 ? 1 : 0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Role Breakdown + Stats */}
        {eventData && !searchQuery && (() => {
          const allResults = eventData.results;
          const roles = ['R1', 'R2', 'R3', 'R4', 'R5'];
          const roleData = roles.map(role => {
            const members = allResults.filter(m => m.role === role && m.kpGain > 0);
            const totalKp = members.reduce((s, m) => s + m.kpGain, 0);
            const totalPower = members.reduce((s, m) => s + m.powerGain, 0);
            const avgKp = members.length > 0 ? totalKp / members.length : 0;
            return { role, count: members.length, totalKp, totalPower, avgKp };
          }).filter(r => r.count > 0);

          const maxRoleKp = Math.max(...roleData.map(r => r.totalKp), 1);

          return (
            <div className={`${theme.card} border rounded-lg p-4 mb-8`}>
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-purple-400" />
                <span className="text-sm font-medium">KP Contribution by Role</span>
              </div>
              <div className="space-y-2">
                {roleData.map(r => {
                  const pct = (r.totalKp / maxRoleKp) * 100;
                  const roleColor = r.role === 'R5' ? '#fbbf24' : r.role === 'R4' ? '#a78bfa' : r.role === 'R3' ? '#60a5fa' : r.role === 'R2' ? '#34d399' : '#94a3b8';
                  return (
                    <div key={r.role} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-7" style={{ color: roleColor }}>{r.role}</span>
                      <div className="flex-1 h-5 bg-[var(--background-secondary)] rounded overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{ width: `${pct}%`, backgroundColor: roleColor, opacity: 0.7 }}
                        />
                      </div>
                      <div className="text-right min-w-[140px] flex gap-3 text-xs">
                        <span style={{ color: roleColor }} className="font-medium">{formatPower(r.totalKp)}</span>
                        <span className={theme.textMuted}>{r.count} members</span>
                        <span className={theme.textMuted}>avg {formatPower(r.avgKp)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

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
              Found {rankedMembers.length + leadership.length} member{rankedMembers.length + leadership.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
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
                  <th className="px-3 py-3 text-left font-medium w-8"></th>
                  <th className="px-2 py-3 text-left font-medium w-12">
                    <button onClick={() => handleSort('rank', 'rankings')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>Rank{sortIcon('rank', 'rankings')}</button>
                  </th>
                  <th className="px-3 py-3 text-left font-medium">
                    <button onClick={() => handleSort('name', 'rankings')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>Name{sortIcon('name', 'rankings')}</button>
                  </th>
                  <th className="px-3 py-3 text-left font-medium" style={{ minWidth: '200px' }}>
                    <button onClick={() => handleSort('kpGain', 'rankings')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>KP Gained{sortIcon('kpGain', 'rankings')}</button>
                  </th>
                  <th className="px-3 py-3 text-left font-medium" style={{ minWidth: '180px' }}>
                    <button onClick={() => handleSort('powerGain', 'rankings')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>Power Change{sortIcon('powerGain', 'rankings')}</button>
                  </th>
                  <th className="px-3 py-3 text-left font-medium" style={{ minWidth: '180px' }}>
                    <button onClick={() => handleSort('ratio', 'rankings')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>KP/P Ratio{sortIcon('ratio', 'rankings')}</button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedMembers.map((member, index) => {
                  const baseRank = rankOrder.get(member.name) ?? index;
                  const isExpanded = expandedMember === member.name;

                  return (
                    <Fragment key={member.name}>
                      <tr
                        className={`hover:bg-[var(--background-secondary)] cursor-pointer ${isExpanded ? 'bg-[var(--background-secondary)]' : ''}`}
                        onClick={() => handleExpandMember(member.name)}
                      >
                        <td className="px-3 py-3">
                          <ChevronRight
                            size={16}
                            className={`transition-transform ${isExpanded ? 'rotate-90' : ''} ${theme.textMuted}`}
                          />
                        </td>
                        <td className="px-2 py-3 font-medium">
                          {getRankBadge(0, baseRank)}
                        </td>
                        <td className="px-3 py-3 font-medium">
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
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                              <div
                                className="h-full rounded bg-gradient-to-r from-[#f6993f] to-[#f6993f]/50"
                                style={{ width: `${(member.kpGain / maxKpGain) * 100}%` }}
                              />
                            </div>
                            <span className="text-right min-w-[70px] font-medium text-[#f6993f] text-xs">
                              +{formatPower(member.kpGain)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[50px]">
                              <div
                                className={`h-full rounded bg-gradient-to-r ${member.powerGain >= 0 ? 'from-[#4299e1] to-[#4299e1]/50' : 'from-[#f56565] to-[#f56565]/50'}`}
                                style={{ width: `${(Math.abs(member.powerGain) / maxPowerGain) * 100}%` }}
                              />
                            </div>
                            <span className={`text-right min-w-[65px] font-medium text-xs ${member.powerGain >= 0 ? 'text-[#4299e1]' : 'text-[#f56565]'}`}>
                              {formatGrowth(member.powerGain)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {member.endRatio !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                <div
                                  className={`h-full rounded bg-gradient-to-r ${member.ratioImproved ? 'from-[#01b574] to-[#01b574]/50' : 'from-[#01b574]/30 to-[#01b574]/15'}`}
                                  style={{ width: `${(member.endRatio / maxEndRatio) * 100}%` }}
                                />
                              </div>
                              <div className="flex flex-col items-end min-w-[70px]">
                                <span className={`font-medium text-xs ${member.ratioImproved ? 'text-[#01b574]' : 'text-[#01b574]/70'}`}>
                                  {formatRatio(member.endRatio)}
                                </span>
                                {member.startRatio !== null && (
                                  <span className={`text-[10px] ${theme.textMuted}`}>
                                    {formatRatio(member.startRatio)} → {formatRatio(member.endRatio)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className={theme.textMuted}>-</span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded row with snapshot history */}
                      {isExpanded && (
                        <tr className="bg-[var(--background-secondary)]/50">
                          <td colSpan={6} className="px-4 py-4">
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
                                              <td className={`px-2 py-1 text-right text-[#f6993f] ${killsCarry ? carryoverClass : ''}`}>
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
                                                <Line type="monotone" dataKey="v" stroke="#f6993f" strokeWidth={1.5} dot={false} />
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
                    </Fragment>
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
                      <th className="px-3 py-3 text-left font-medium w-8"></th>
                      <th className="px-3 py-3 text-left font-medium">
                        <button onClick={() => handleSort('name', 'leadership')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>Name{sortIcon('name', 'leadership')}</button>
                      </th>
                      <th className="px-3 py-3 text-left font-medium w-16">Role</th>
                      <th className="px-3 py-3 text-left font-medium" style={{ minWidth: '200px' }}>
                        <button onClick={() => handleSort('kpGain', 'leadership')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>KP Gained{sortIcon('kpGain', 'leadership')}</button>
                      </th>
                      <th className="px-3 py-3 text-left font-medium" style={{ minWidth: '180px' }}>
                        <button onClick={() => handleSort('powerGain', 'leadership')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>Power Change{sortIcon('powerGain', 'leadership')}</button>
                      </th>
                      <th className="px-3 py-3 text-left font-medium" style={{ minWidth: '180px' }}>
                        <button onClick={() => handleSort('ratio', 'leadership')} className={`flex items-center gap-0.5 font-medium ${theme.textMuted} hover:text-[var(--foreground)]`}>KP/P Ratio{sortIcon('ratio', 'leadership')}</button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {leadership.map((member) => {
                      const isExpanded = expandedMember === member.name;
                      const leaderMaxKp = Math.max(...leadership.map(l => Math.abs(l.kpGain)), 1);
                      const leaderMaxPower = Math.max(...leadership.map(l => Math.abs(l.powerGain)), 1);
                      return (
                        <Fragment key={member.name}>
                          <tr
                            className={`hover:bg-[var(--background-secondary)] cursor-pointer ${isExpanded ? 'bg-[var(--background-secondary)]' : ''}`}
                            onClick={() => handleExpandMember(member.name)}
                          >
                            <td className="px-3 py-3">
                              <ChevronRight
                                size={16}
                                className={`transition-transform ${isExpanded ? 'rotate-90' : ''} ${theme.textMuted}`}
                              />
                            </td>
                            <td className="px-3 py-3 font-medium">{member.name}</td>
                            <td className="px-3 py-3">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                member.role === 'R5' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-purple-500/20 text-purple-400'
                              }`}>
                                {member.role}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {member.kpGain > 0 ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                    <div
                                      className="h-full rounded bg-gradient-to-r from-[#f6993f] to-[#f6993f]/50"
                                      style={{ width: `${(member.kpGain / leaderMaxKp) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-right min-w-[70px] font-medium text-[#f6993f] text-xs">
                                    +{formatPower(member.kpGain)}
                                  </span>
                                </div>
                              ) : (
                                <span className={`text-xs ${theme.textMuted}`}>{formatGrowth(member.kpGain)}</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {member.powerGain !== 0 ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[50px]">
                                    <div
                                      className={`h-full rounded bg-gradient-to-r ${member.powerGain >= 0 ? 'from-[#4299e1] to-[#4299e1]/50' : 'from-[#f56565] to-[#f56565]/50'}`}
                                      style={{ width: `${(Math.abs(member.powerGain) / leaderMaxPower) * 100}%` }}
                                    />
                                  </div>
                                  <span className={`text-right min-w-[65px] font-medium text-xs ${member.powerGain >= 0 ? 'text-[#4299e1]' : 'text-[#f56565]'}`}>
                                    {formatGrowth(member.powerGain)}
                                  </span>
                                </div>
                              ) : (
                                <span className={`text-xs ${theme.textMuted}`}>0</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {member.endRatio !== null ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-4 bg-[var(--background-secondary)] rounded overflow-hidden min-w-[60px]">
                                    <div
                                      className={`h-full rounded bg-gradient-to-r ${member.ratioImproved ? 'from-[#01b574] to-[#01b574]/50' : 'from-[#01b574]/30 to-[#01b574]/15'}`}
                                      style={{ width: `${(member.endRatio / maxEndRatio) * 100}%` }}
                                    />
                                  </div>
                                  <div className="flex flex-col items-end min-w-[70px]">
                                    <span className={`font-medium text-xs ${member.ratioImproved ? 'text-[#01b574]' : 'text-[#01b574]/70'}`}>
                                      {formatRatio(member.endRatio)}
                                    </span>
                                    {member.startRatio !== null && (
                                      <span className={`text-[10px] ${theme.textMuted}`}>
                                        {formatRatio(member.startRatio)} → {formatRatio(member.endRatio)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className={theme.textMuted}>-</span>
                              )}
                            </td>
                          </tr>
                          {/* Expanded row with snapshot history */}
                          {isExpanded && (
                            <tr className="bg-[var(--background-secondary)]/50">
                              <td colSpan={6} className="px-4 py-4">
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
                                                  <td className={`px-2 py-1 text-right text-[#f6993f] ${killsCarry ? carryoverClass : ''}`}>
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
                                      {/* Growth Sparkline Charts */}
                                      {memberSnapshots.length >= 2 && (
                                        <div className="md:w-64 shrink-0">
                                          <div className={`text-xs ${theme.textMuted} mb-2`}>Growth Trends</div>
                                          <div className="grid grid-cols-2 gap-2">
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
                                            <div className="text-center bg-[var(--background)]/50 rounded p-2">
                                              <div style={{ height: 45 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                  <LineChart data={memberSnapshots.map(s => ({ v: s.kills || 0 }))} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                                    <Line type="monotone" dataKey="v" stroke="#f6993f" strokeWidth={1.5} dot={false} />
                                                  </LineChart>
                                                </ResponsiveContainer>
                                              </div>
                                              <div className={`text-[10px] ${theme.textMuted} mt-1`}>Kill Points</div>
                                            </div>
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
                        </Fragment>
                      );
                    })}
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
