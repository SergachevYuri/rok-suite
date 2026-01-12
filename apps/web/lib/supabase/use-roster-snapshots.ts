import { useState, useEffect, useCallback } from 'react';
import { createClient } from './client';

export interface RosterSnapshot {
  id: string;
  snapshot_date: string;
  member_name: string;
  power: number;
  kills: number;
  t4_kills: number;
  t5_kills: number;
  honor_points: number;
  role: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DailyTotals {
  snapshot_date: string;
  member_count: number;
  total_power: number;
  total_kills: number;
  total_honor: number;
  avg_power: number;
}

export interface MemberChange {
  name: string;
  type: 'joined' | 'left';
  date: string;
  power?: number;
}

export interface TopGainer {
  name: string;
  powerGain: number;
  killsGain: number;
  honorGain: number;
  startPower: number;
  endPower: number;
  startKills: number;
  endKills: number;
  startHonor: number;
  endHonor: number;
}

/**
 * Create a snapshot of the current roster for today
 * Uses upsert to allow updating today's snapshot if called multiple times
 */
export async function createSnapshot(roster: Array<{ name: string; power: number; kills: number; t4_kills?: number; t5_kills?: number; honor_points?: number; role: string | null; is_active?: boolean }>) {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const snapshotRows = roster.map(member => ({
    snapshot_date: today,
    member_name: member.name,
    power: member.power,
    kills: member.kills || 0,
    t4_kills: member.t4_kills || 0,
    t5_kills: member.t5_kills || 0,
    honor_points: member.honor_points || 0,
    role: member.role,
    is_active: member.is_active ?? true,
  }));

  const { data, error } = await supabase
    .from('roster_snapshots')
    .upsert(snapshotRows, { onConflict: 'snapshot_date,member_name' })
    .select();

  if (error) {
    console.error('Error creating snapshot:', error);
    throw error;
  }

  return { date: today, count: data?.length || 0 };
}

/**
 * Get the most recent snapshot date
 */
export async function getLastSnapshotDate(): Promise<string | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('roster_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.snapshot_date;
}

/**
 * Get all available snapshot dates
 */
export async function getSnapshotDates(): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('roster_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false });

  if (error || !data) return [];

  // Get unique dates
  const uniqueDates = [...new Set(data.map(d => d.snapshot_date))];
  return uniqueDates;
}

/**
 * Get daily totals for charts
 */
export async function getDailyTotals(limit = 30): Promise<DailyTotals[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('roster_daily_totals')
    .select('*')
    .order('snapshot_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching daily totals:', error);
    return [];
  }

  return data || [];
}

/**
 * Get history for a specific member
 */
export async function getMemberHistory(memberName: string, limit = 30): Promise<RosterSnapshot[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('roster_snapshots')
    .select('*')
    .eq('member_name', memberName)
    .order('snapshot_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching member history:', error);
    return [];
  }

  return data || [];
}

/**
 * Get top power/KP/Honor gainers between two dates
 */
export async function getTopGainers(startDate: string, endDate: string, limit = 10): Promise<TopGainer[]> {
  const supabase = createClient();

  // Get snapshots for start date
  const { data: startData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power, kills, honor_points')
    .eq('snapshot_date', startDate)
    .eq('is_active', true);

  // Get snapshots for end date
  const { data: endData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power, kills, honor_points')
    .eq('snapshot_date', endDate)
    .eq('is_active', true);

  if (!startData || !endData) return [];

  const startMap = new Map(startData.map(d => [d.member_name, d]));
  const gainers: TopGainer[] = [];

  for (const end of endData) {
    const start = startMap.get(end.member_name);
    if (start) {
      gainers.push({
        name: end.member_name,
        powerGain: end.power - start.power,
        killsGain: (end.kills || 0) - (start.kills || 0),
        honorGain: (end.honor_points || 0) - (start.honor_points || 0),
        startPower: start.power,
        endPower: end.power,
        startKills: start.kills || 0,
        endKills: end.kills || 0,
        startHonor: start.honor_points || 0,
        endHonor: end.honor_points || 0,
      });
    }
  }

  // Sort by power gain descending
  return gainers
    .sort((a, b) => b.powerGain - a.powerGain)
    .slice(0, limit);
}

export interface KpGrowth {
  name: string;
  previousKp: number;
  currentKp: number;
  kpGrowth: number;
  previousT4: number;
  currentT4: number;
  t4Growth: number;
  previousT5: number;
  currentT5: number;
  t5Growth: number;
  previousDate: string | null;
  currentDate: string | null;
}

/**
 * Get KP growth between the two most recent snapshots
 * Compares kills, T4 kills, and T5 kills between snapshots
 */
export async function getKpGrowth(currentRoster: Array<{ name: string; kills: number; t4_kills: number; t5_kills: number }>): Promise<KpGrowth[]> {
  const supabase = createClient();

  // Get the two most recent snapshot dates
  const dates = await getSnapshotDates();
  if (dates.length < 2) return [];

  const previousDate = dates[1]; // Second most recent
  const currentDate = dates[0];  // Most recent

  // Get previous snapshot data including T4/T5
  const { data: previousData } = await supabase
    .from('roster_snapshots')
    .select('member_name, kills, t4_kills, t5_kills')
    .eq('snapshot_date', previousDate)
    .eq('is_active', true);

  if (!previousData) return [];

  const previousMap = new Map(previousData.map(d => [d.member_name, {
    kills: d.kills || 0,
    t4_kills: d.t4_kills || 0,
    t5_kills: d.t5_kills || 0,
  }]));

  const growth: KpGrowth[] = currentRoster
    .filter(m => {
      const prev = previousMap.get(m.name);
      // Only include if they existed in previous snapshot AND had non-zero KP
      // (0 KP means they weren't entered yet, not that they grew from 0)
      return prev && prev.kills > 0;
    })
    .map(m => {
      const prev = previousMap.get(m.name) || { kills: 0, t4_kills: 0, t5_kills: 0 };
      return {
        name: m.name,
        previousKp: prev.kills,
        currentKp: m.kills || 0,
        kpGrowth: (m.kills || 0) - prev.kills,
        // Only show T4/T5 growth if previous value was non-zero
        previousT4: prev.t4_kills,
        currentT4: m.t4_kills || 0,
        t4Growth: prev.t4_kills > 0 ? (m.t4_kills || 0) - prev.t4_kills : 0,
        previousT5: prev.t5_kills,
        currentT5: m.t5_kills || 0,
        t5Growth: prev.t5_kills > 0 ? (m.t5_kills || 0) - prev.t5_kills : 0,
        previousDate,
        currentDate,
      };
    });

  return growth;
}

/**
 * Detect membership changes (joins/leaves) between snapshots
 */
export async function getMembershipChanges(limit = 20): Promise<MemberChange[]> {
  const supabase = createClient();

  // Get all snapshots ordered by date
  const { data: snapshots } = await supabase
    .from('roster_snapshots')
    .select('snapshot_date, member_name, is_active, power')
    .eq('is_active', true)
    .order('snapshot_date', { ascending: true });

  if (!snapshots || snapshots.length === 0) return [];

  // Group by date
  const byDate = new Map<string, Set<string>>();
  const powerByMember = new Map<string, number>();

  for (const snap of snapshots) {
    if (!byDate.has(snap.snapshot_date)) {
      byDate.set(snap.snapshot_date, new Set());
    }
    byDate.get(snap.snapshot_date)!.add(snap.member_name);
    powerByMember.set(snap.member_name, snap.power);
  }

  const dates = [...byDate.keys()].sort();
  const changes: MemberChange[] = [];

  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1];
    const currDate = dates[i];
    const prevMembers = byDate.get(prevDate)!;
    const currMembers = byDate.get(currDate)!;

    // Find joins (in current but not previous)
    for (const name of currMembers) {
      if (!prevMembers.has(name)) {
        changes.push({
          name,
          type: 'joined',
          date: currDate,
          power: powerByMember.get(name),
        });
      }
    }

    // Find leaves (in previous but not current)
    for (const name of prevMembers) {
      if (!currMembers.has(name)) {
        changes.push({
          name,
          type: 'left',
          date: currDate,
          power: powerByMember.get(name),
        });
      }
    }
  }

  // Return most recent changes first
  return changes.reverse().slice(0, limit);
}

/**
 * Hook for using roster snapshots in React components
 */
export function useRosterSnapshots() {
  const [dailyTotals, setDailyTotals] = useState<DailyTotals[]>([]);
  const [memberChanges, setMemberChanges] = useState<MemberChange[]>([]);
  const [lastSnapshotDate, setLastSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [totals, changes, lastDate] = await Promise.all([
        getDailyTotals(30),
        getMembershipChanges(20),
        getLastSnapshotDate(),
      ]);

      setDailyTotals(totals);
      setMemberChanges(changes);
      setLastSnapshotDate(lastDate);
    } catch (err) {
      console.error('Error fetching snapshot data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    dailyTotals,
    memberChanges,
    lastSnapshotDate,
    loading,
    error,
    refetch: fetchData,
  };
}

// Utility to format power with M suffix
export const formatPower = (power: number): string => {
  if (power >= 1000000) {
    return (power / 1000000).toFixed(1) + 'M';
  }
  return power.toLocaleString();
};

// Utility to format date for display
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
