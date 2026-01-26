'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Calendar, Target, Users, TrendingUp, Medal, ChevronDown, ChevronUp } from 'lucide-react';
import { getTheme } from '@/lib/guide/theme';
import { createClient } from '@/lib/supabase/client';
import { formatPower } from '@/lib/supabase/use-roster-snapshots';

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
  ratio: number | null; // power:kp ratio (lower is better for KP focus)
  ratioMet: boolean; // true if KP gain >= power gain
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

        // Fetch snapshots for start date
        const { data: startSnapshots } = await supabase
          .from('roster_snapshots')
          .select('member_name, power, kills')
          .eq('snapshot_date', actualStartDate)
          .eq('is_active', true);

        // Fetch snapshots for end date
        const { data: endSnapshots } = await supabase
          .from('roster_snapshots')
          .select('member_name, power, kills')
          .eq('snapshot_date', actualEndDate)
          .eq('is_active', true);

        if (!startSnapshots || !endSnapshots) {
          setError('Could not fetch snapshot data');
          return;
        }

        // Build maps using canonical names
        const startMap = new Map<string, { power: number; kp: number }>();
        for (const snap of startSnapshots) {
          const canonical = getCanonicalName(snap.member_name);
          if (!startMap.has(canonical)) {
            startMap.set(canonical, { power: snap.power || 0, kp: snap.kills || 0 });
          }
        }

        const endMap = new Map<string, { power: number; kp: number; name: string }>();
        for (const snap of endSnapshots) {
          const canonical = getCanonicalName(snap.member_name);
          if (!endMap.has(canonical)) {
            endMap.set(canonical, { power: snap.power || 0, kp: snap.kills || 0, name: snap.member_name });
          }
        }

        // Calculate results for members present in both snapshots
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

          const ratio = kpGain > 0 ? powerGain / kpGain : (powerGain > 0 ? Infinity : null);
          const ratioMet = kpGain >= powerGain;

          results.push({
            name: end.name,
            role: roleMap.get(canonical) || roleMap.get(end.name) || null,
            startPower: start.power,
            endPower: end.power,
            powerGain,
            startKp: start.kp,
            endKp: end.kp,
            kpGain,
            ratio,
            ratioMet,
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

  // Separate results into categories
  const rankedMembers = eventData?.results
    .filter(r => r.kpGain > 0 && r.role !== 'R4' && r.role !== 'R5')
    .sort((a, b) => b.kpGain - a.kpGain) || [];

  const leadership = eventData?.results
    .filter(r => r.role === 'R4' || r.role === 'R5')
    .sort((a, b) => b.kpGain - a.kpGain) || [];

  const nonGainers = eventData?.results
    .filter(r => r.kpGain <= 0 && r.role !== 'R4' && r.role !== 'R5')
    .sort((a, b) => a.kpGain - b.kpGain) || [];

  const formatRatio = (ratio: number | null): string => {
    if (ratio === null) return '-';
    if (ratio === Infinity) return '∞';
    return ratio.toFixed(1) + ':1';
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <span className="text-amber-400">🥇</span>;
    if (index === 1) return <span className="text-gray-300">🥈</span>;
    if (index === 2) return <span className="text-amber-600">🥉</span>;
    return <span className="text-[var(--text-muted)] w-6 inline-block text-center">{index + 1}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className={theme.textMuted}>Loading event data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  return (
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
              <span className={`text-sm ${theme.textMuted}`}>Total Power Gained</span>
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
              {formatRatio(eventData?.allianceRatio || null)}
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

        {/* Leaderboard */}
        <div className={`${theme.card} border rounded-lg overflow-hidden mb-6`}>
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Medal size={20} className="text-amber-400" />
              <h2 className="text-lg font-semibold">Rankings</h2>
              <span className={`text-sm ${theme.textMuted}`}>({rankedMembers.length} members)</span>
            </div>
            <p className={`text-xs ${theme.textMuted} mt-1`}>Excludes R4/R5 leadership</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`${theme.card} border-b border-[var(--border)]`}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Rank</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">KP Gained</th>
                  <th className="px-4 py-3 text-right font-medium">Power Gained</th>
                  <th className="px-4 py-3 text-right font-medium">Ratio</th>
                  <th className="px-4 py-3 text-center font-medium">Goal Met</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rankedMembers.map((member, index) => (
                  <tr key={member.name} className="hover:bg-[var(--background-secondary)]">
                    <td className="px-4 py-3 font-medium">
                      {getRankBadge(index)}
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
                      +{formatPower(member.kpGain)}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-400">
                      +{formatPower(member.powerGain)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatRatio(member.ratio)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {member.ratioMet ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      <th className="px-4 py-3 text-right font-medium">Power Gained</th>
                      <th className="px-4 py-3 text-right font-medium">Ratio</th>
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
                          {member.kpGain > 0 ? '+' : ''}{formatPower(member.kpGain)}
                        </td>
                        <td className={`px-4 py-3 text-right ${member.powerGain > 0 ? 'text-blue-400' : theme.textMuted}`}>
                          {member.powerGain > 0 ? '+' : ''}{formatPower(member.powerGain)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatRatio(member.ratio)}
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
                          {member.kpGain === 0 ? '0' : formatPower(member.kpGain)}
                        </td>
                        <td className={`px-4 py-3 text-right ${member.powerGain > 0 ? 'text-blue-400' : theme.textMuted}`}>
                          {member.powerGain > 0 ? '+' : ''}{formatPower(member.powerGain)}
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
  );
}
