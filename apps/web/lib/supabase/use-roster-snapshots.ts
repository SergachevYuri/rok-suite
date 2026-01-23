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
 * Update a single member's snapshot for today
 * Uses upsert to create or update today's snapshot entry for this member
 */
export async function updateMemberSnapshot(member: {
  name: string;
  power: number;
  kills: number;
  t4_kills?: number;
  t5_kills?: number;
  honor_points?: number;
  role: string | null;
  is_active?: boolean;
}) {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const { error } = await supabase
    .from('roster_snapshots')
    .upsert({
      snapshot_date: today,
      member_name: member.name,
      power: member.power,
      kills: member.kills || 0,
      t4_kills: member.t4_kills || 0,
      t5_kills: member.t5_kills || 0,
      honor_points: member.honor_points || 0,
      role: member.role,
      is_active: member.is_active ?? true,
    }, { onConflict: 'snapshot_date,member_name' });

  if (error) {
    console.error('Error updating member snapshot:', error);
    throw error;
  }

  return { date: today, member: member.name };
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
 * Update honor points for existing snapshots on a specific date
 * This is used when honor points data comes from a separate import
 */
export async function updateHonorPointsForDate(
  snapshotDate: string,
  honorData: Array<{ name: string; honor_points: number }>
): Promise<{ updated: number; notFound: string[] }> {
  const supabase = createClient();

  let updated = 0;
  const notFound: string[] = [];

  for (const entry of honorData) {
    // Try to find matching snapshot by normalized name
    const normalizedName = normalizeName(entry.name);

    // Get all snapshots for this date
    const { data: snapshots } = await supabase
      .from('roster_snapshots')
      .select('id, member_name')
      .eq('snapshot_date', snapshotDate);

    if (!snapshots) continue;

    // Find matching member by normalized name
    const match = snapshots.find(s => normalizeName(s.member_name) === normalizedName);

    if (match) {
      const { error } = await supabase
        .from('roster_snapshots')
        .update({ honor_points: entry.honor_points })
        .eq('id', match.id);

      if (!error) {
        updated++;
      }
    } else {
      notFound.push(entry.name);
    }
  }

  return { updated, notFound };
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
 * Uses the roster_daily_totals view which already has distinct dates
 */
export async function getSnapshotDates(): Promise<string[]> {
  const supabase = createClient();

  // Use the daily_totals view which has pre-aggregated distinct dates
  // This avoids pagination issues when querying the large roster_snapshots table
  const { data, error } = await supabase
    .from('roster_daily_totals')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false });

  if (error || !data) return [];

  return data.map(d => d.snapshot_date);
}

// Snapshot dates to exclude from charts/growth tracking (data not reliable for these dates)
const EXCLUDED_SNAPSHOT_DATES = ['2026-01-14'];

/**
 * Get snapshot dates excluding unreliable ones
 */
export function getFilteredSnapshotDates(dates: string[]): string[] {
  return dates.filter(d => !EXCLUDED_SNAPSHOT_DATES.includes(d));
}

/**
 * Normalize name for matching across snapshots
 * Handles various alliance tag prefixes that may differ between data sources
 */
function normalizeName(name: string): string {
  return name
    .replace(/^\['ANG\]\s*/i, '')  // Remove ['ANG] prefix
    .replace(/^\[ANG\]\s*/i, '')   // Remove [ANG] prefix
    .replace(/^ang/i, '')          // Remove 'ang' prefix
    .replace(/^ᵃⁿᵍ/i, '')          // Remove superscript 'ang' prefix
    .replace(/^ᴬ\s*/i, '')         // Remove superscript 'A' prefix
    .toLowerCase()
    .trim();
}

/**
 * Get daily totals for charts
 */
export async function getDailyTotals(limit = 30): Promise<DailyTotals[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('roster_daily_totals')
    .select('*')
    .not('snapshot_date', 'in', `(${EXCLUDED_SNAPSHOT_DATES.join(',')})`)
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
 * Handles name variations by searching with normalized names if exact match fails
 */
export async function getMemberHistory(memberName: string, limit = 30): Promise<RosterSnapshot[]> {
  const supabase = createClient();

  // First try exact match
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

  // If we got results, return them
  if (data && data.length > 0) {
    return data;
  }

  // Try to find matching members by normalized name
  const normalizedTarget = normalizeName(memberName);

  // Get all unique member names to find variations
  const { data: allMembers } = await supabase
    .from('roster_snapshots')
    .select('member_name')
    .limit(1000);

  if (!allMembers) return [];

  // Find all name variations that match the normalized name
  const nameVariations = [...new Set(
    allMembers
      .map(m => m.member_name)
      .filter(name => normalizeName(name) === normalizedTarget)
  )];

  if (nameVariations.length === 0) return [];

  // Fetch history for all name variations
  const { data: historyData, error: historyError } = await supabase
    .from('roster_snapshots')
    .select('*')
    .in('member_name', nameVariations)
    .order('snapshot_date', { ascending: true })
    .limit(limit);

  if (historyError) {
    console.error('Error fetching member history with variations:', historyError);
    return [];
  }

  return historyData || [];
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

  // Use normalized names for matching (handles prefix variations between snapshots)
  const startMap = new Map(startData.map(d => [normalizeName(d.member_name), d]));
  const gainers: TopGainer[] = [];

  for (const end of endData) {
    const start = startMap.get(normalizeName(end.member_name));
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
 * Get KP growth between the two most recent snapshots that have KP data changes
 * Compares kills, T4 kills, and T5 kills between snapshots
 */
export async function getKpGrowth(currentRoster: Array<{ name: string; kills: number; t4_kills: number; t5_kills: number }>): Promise<KpGrowth[]> {
  const supabase = createClient();

  // Get all recent snapshot dates (excluding unreliable ones)
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 2) return [];

  // Find two dates where KP totals actually differ (indicating real updates)
  let currentDate: string | null = null;
  let previousDate: string | null = null;
  let currentTotalKp = 0;

  for (const date of dates) {
    const { data } = await supabase
      .from('roster_snapshots')
      .select('kills')
      .eq('snapshot_date', date)
      .eq('is_active', true)
      .limit(2000);

    const totalKp = data?.reduce((sum, d) => sum + (d.kills || 0), 0) || 0;

    if (!currentDate) {
      currentDate = date;
      currentTotalKp = totalKp;
    } else if (totalKp !== currentTotalKp) {
      // Found a date with different KP total - this is actual data, not carryover
      previousDate = date;
      break;
    }
  }

  if (!currentDate || !previousDate) return [];

  // Get snapshot data for both dates
  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, kills, t4_kills, t5_kills')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .limit(2000);

  const { data: previousData } = await supabase
    .from('roster_snapshots')
    .select('member_name, kills, t4_kills, t5_kills')
    .eq('snapshot_date', previousDate)
    .eq('is_active', true)
    .limit(2000);

  if (!previousData || !currentData) return [];

  // Use normalized names for matching
  const previousMap = new Map(previousData.map(d => [normalizeName(d.member_name), {
    kills: d.kills || 0,
    t4_kills: d.t4_kills || 0,
    t5_kills: d.t5_kills || 0,
  }]));

  const growth: KpGrowth[] = currentData
    .filter(m => {
      const prev = previousMap.get(normalizeName(m.member_name));
      return prev && prev.kills > 0;
    })
    .map(m => {
      const prev = previousMap.get(normalizeName(m.member_name)) || { kills: 0, t4_kills: 0, t5_kills: 0 };
      return {
        name: m.member_name,
        previousKp: prev.kills,
        currentKp: m.kills || 0,
        kpGrowth: (m.kills || 0) - prev.kills,
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

export interface PowerGrowth {
  name: string;
  previousPower: number;
  currentPower: number;
  powerGrowth: number;
  previousDate: string | null;
  currentDate: string | null;
}

/**
 * Get Power growth between the two most recent snapshots that have Power data changes
 */
export async function getPowerGrowth(currentRoster: Array<{ name: string; power: number }>): Promise<PowerGrowth[]> {
  const supabase = createClient();

  // Get all recent snapshot dates (excluding unreliable ones)
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 2) return [];

  // Find two dates where Power totals actually differ (indicating real updates)
  let currentDate: string | null = null;
  let previousDate: string | null = null;
  let currentTotalPower = 0;

  for (const date of dates) {
    const { data } = await supabase
      .from('roster_snapshots')
      .select('power')
      .eq('snapshot_date', date)
      .eq('is_active', true)
      .limit(2000);

    const totalPower = data?.reduce((sum, d) => sum + (d.power || 0), 0) || 0;

    if (!currentDate) {
      currentDate = date;
      currentTotalPower = totalPower;
    } else if (totalPower !== currentTotalPower) {
      // Found a date with different Power total - this is actual data, not carryover
      previousDate = date;
      break;
    }
  }

  if (!currentDate || !previousDate) return [];

  // Get snapshot data for both dates
  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .limit(2000);

  const { data: previousData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power')
    .eq('snapshot_date', previousDate)
    .eq('is_active', true)
    .limit(2000);

  if (!previousData || !currentData) return [];

  // Use normalized names for matching
  const previousMap = new Map(previousData.map(d => [normalizeName(d.member_name), d.power || 0]));

  const growth: PowerGrowth[] = currentData
    .filter(m => {
      const prev = previousMap.get(normalizeName(m.member_name));
      return prev !== undefined && prev > 0;
    })
    .map(m => {
      const prev = previousMap.get(normalizeName(m.member_name)) || 0;
      return {
        name: m.member_name,
        previousPower: prev,
        currentPower: m.power || 0,
        powerGrowth: (m.power || 0) - prev,
        previousDate,
        currentDate,
      };
    });

  return growth;
}

export interface HonorGrowth {
  name: string;
  previousHonor: number;
  currentHonor: number;
  honorGrowth: number;
  previousDate: string | null;
  currentDate: string | null;
}

/**
 * Get Honor growth between the two most recent snapshots
 * Compares snapshot data directly (not current roster) to show accurate growth
 */
export async function getHonorGrowth(currentRoster: Array<{ name: string; honor_points: number }>): Promise<HonorGrowth[]> {
  const supabase = createClient();

  // Get the two most recent snapshot dates (excluding unreliable ones)
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 2) return [];

  const previousDate = dates[1]; // Second most recent
  const currentDate = dates[0];  // Most recent

  // Get previous snapshot data
  const { data: previousData } = await supabase
    .from('roster_snapshots')
    .select('member_name, honor_points')
    .eq('snapshot_date', previousDate)
    .eq('is_active', true);

  // Get current snapshot data (use actual snapshot, not live roster)
  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, honor_points')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true);

  if (!previousData || !currentData) return [];

  // Use normalized names for matching (handles prefix variations between snapshots)
  const previousMap = new Map(previousData.map(d => [normalizeName(d.member_name), d.honor_points || 0]));

  const growth: HonorGrowth[] = currentData
    .filter(m => {
      const prev = previousMap.get(normalizeName(m.member_name));
      // Only include if they existed in previous snapshot AND had non-zero honor in both
      return prev !== undefined && prev > 0 && (m.honor_points || 0) > 0;
    })
    .map(m => {
      const prev = previousMap.get(normalizeName(m.member_name)) || 0;
      const current = m.honor_points || 0;
      return {
        name: m.member_name,
        previousHonor: prev,
        currentHonor: current,
        honorGrowth: current - prev,
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
 * Get all snapshots for computing filtered totals
 */
export async function getAllSnapshots(dateLimit = 10): Promise<RosterSnapshot[]> {
  const supabase = createClient();

  // Get unique dates first, excluding unreliable dates
  const dates = await getSnapshotDates();
  const recentDates = dates
    .filter(d => !EXCLUDED_SNAPSHOT_DATES.includes(d))
    .slice(0, dateLimit);

  if (recentDates.length === 0) return [];

  // Fetch snapshots for each date separately to avoid Supabase row limits
  const allData: RosterSnapshot[] = [];

  for (const date of recentDates) {
    const { data, error } = await supabase
      .from('roster_snapshots')
      .select('*')
      .eq('snapshot_date', date)
      .eq('is_active', true)
      .limit(2000);

    if (error) {
      console.error(`Error fetching snapshots for ${date}:`, error);
      continue;
    }

    if (data) {
      allData.push(...data);
    }
  }

  // Sort by date ascending
  return allData.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
}

/**
 * Hook for using roster snapshots in React components
 */
export function useRosterSnapshots() {
  const [dailyTotals, setDailyTotals] = useState<DailyTotals[]>([]);
  const [allSnapshots, setAllSnapshots] = useState<RosterSnapshot[]>([]);
  const [memberChanges, setMemberChanges] = useState<MemberChange[]>([]);
  const [lastSnapshotDate, setLastSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [totals, snapshots, changes, lastDate] = await Promise.all([
        getDailyTotals(30),
        getAllSnapshots(30),
        getMembershipChanges(20),
        getLastSnapshotDate(),
      ]);

      setDailyTotals(totals);
      setAllSnapshots(snapshots);
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
    allSnapshots,
    memberChanges,
    lastSnapshotDate,
    loading,
    error,
    refetch: fetchData,
  };
}

/**
 * Get the latest non-null value for each field for all members
 * This is used to fill in missing values when the current roster has nulls/zeros
 */
export async function getLatestValuesForAllMembers(): Promise<Map<string, {
  kills: number | null;
  t4_kills: number | null;
  t5_kills: number | null;
  honor_points: number | null;
  power: number | null;
}>> {
  const supabase = createClient();

  // Get all snapshots ordered by date descending (newest first)
  const { data: snapshots, error } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, kills, t4_kills, t5_kills, honor_points, power')
    .order('snapshot_date', { ascending: false })
    .limit(10000);

  if (error || !snapshots) {
    console.error('Error fetching snapshots for latest values:', error);
    return new Map();
  }

  // For each member, find the latest non-null/non-zero value for each field
  const latestValues = new Map<string, {
    kills: number | null;
    t4_kills: number | null;
    t5_kills: number | null;
    honor_points: number | null;
    power: number | null;
  }>();

  for (const snapshot of snapshots) {
    const name = snapshot.member_name;
    const existing = latestValues.get(name) || {
      kills: null,
      t4_kills: null,
      t5_kills: null,
      honor_points: null,
      power: null,
    };

    // Only set value if current is null and snapshot has a non-null/non-zero value
    if (existing.kills === null && snapshot.kills && snapshot.kills > 0) {
      existing.kills = snapshot.kills;
    }
    if (existing.t4_kills === null && snapshot.t4_kills && snapshot.t4_kills > 0) {
      existing.t4_kills = snapshot.t4_kills;
    }
    if (existing.t5_kills === null && snapshot.t5_kills && snapshot.t5_kills > 0) {
      existing.t5_kills = snapshot.t5_kills;
    }
    if (existing.honor_points === null && snapshot.honor_points && snapshot.honor_points > 0) {
      existing.honor_points = snapshot.honor_points;
    }
    if (existing.power === null && snapshot.power && snapshot.power > 0) {
      existing.power = snapshot.power;
    }

    latestValues.set(name, existing);
  }

  return latestValues;
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
