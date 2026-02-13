import { useState, useEffect, useCallback } from 'react';
import { createClient, fetchAllRows } from './client';

export interface RosterSnapshot {
  id: string;
  snapshot_date: string;
  member_name: string;
  power: number;
  kills: number;
  t4_kills: number;
  t5_kills: number;
  honor_points: number;
  gathered: number;
  alliance_helps: number;
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
  gathered?: number;
  alliance_helps?: number;
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
      gathered: member.gathered || 0,
      alliance_helps: member.alliance_helps || 0,
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
export async function createSnapshot(roster: Array<{ name: string; power: number; kills: number; t4_kills?: number; t5_kills?: number; honor_points?: number; gathered?: number; alliance_helps?: number; role: string | null; is_active?: boolean }>) {
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
    gathered: member.gathered || 0,
    alliance_helps: member.alliance_helps || 0,
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
// These dates were deleted from the database, keeping this for future use if needed
const EXCLUDED_SNAPSHOT_DATES: string[] = [];

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
 * Get all name variants for a member from the alliance_roster table
 * Includes current name, alternate_names, and follows merged_into chain
 */
async function getMemberNameVariants(memberName: string): Promise<string[]> {
  const supabase = createClient();
  const variants = new Set<string>([memberName]);

  // Look up the member in alliance_roster
  const { data: member } = await supabase
    .from('alliance_roster')
    .select('id, name, alternate_names, merged_into')
    .eq('name', memberName)
    .single();

  if (member) {
    // Add alternate names
    if (member.alternate_names && Array.isArray(member.alternate_names)) {
      for (const alt of member.alternate_names) {
        variants.add(alt);
      }
    }

    // If this member was merged into another, get that member's names too
    if (member.merged_into) {
      const { data: primary } = await supabase
        .from('alliance_roster')
        .select('name, alternate_names')
        .eq('id', member.merged_into)
        .single();

      if (primary) {
        variants.add(primary.name);
        if (primary.alternate_names && Array.isArray(primary.alternate_names)) {
          for (const alt of primary.alternate_names) {
            variants.add(alt);
          }
        }
      }
    }
  }

  // Also find any members that were merged INTO this member
  const { data: mergedMembers } = await supabase
    .from('alliance_roster')
    .select('name, alternate_names')
    .eq('merged_into', member?.id || '');

  if (mergedMembers) {
    for (const merged of mergedMembers) {
      variants.add(merged.name);
      if (merged.alternate_names && Array.isArray(merged.alternate_names)) {
        for (const alt of merged.alternate_names) {
          variants.add(alt);
        }
      }
    }
  }

  return [...variants];
}

/**
 * Build a mapping from all name variants to the canonical (current) member name
 * This allows growth functions to match snapshots across name changes
 */
async function buildNameVariantMapping(): Promise<Map<string, string>> {
  const supabase = createClient();
  const mapping = new Map<string, string>();

  // Get all roster members with their alternate names
  const { data: roster } = await supabase
    .from('alliance_roster')
    .select('name, alternate_names, merged_into, is_active')
    .eq('is_active', true);

  if (!roster) return mapping;

  // For each active member, map all their variants to the canonical name
  for (const member of roster) {
    // Map the canonical name to itself
    mapping.set(member.name, member.name);

    // Map alternate names to the canonical name
    if (member.alternate_names && Array.isArray(member.alternate_names)) {
      for (const alt of member.alternate_names) {
        mapping.set(alt, member.name);
      }
    }
  }

  // Also handle merged members - their names should map to the primary member
  const { data: mergedMembers } = await supabase
    .from('alliance_roster')
    .select('name, alternate_names, merged_into')
    .not('merged_into', 'is', null);

  if (mergedMembers) {
    for (const merged of mergedMembers) {
      // Find the primary member
      const primary = roster.find(m => m.name === merged.merged_into ||
        roster.some(r => r.alternate_names?.includes(merged.merged_into)));

      if (primary) {
        mapping.set(merged.name, primary.name);
        if (merged.alternate_names && Array.isArray(merged.alternate_names)) {
          for (const alt of merged.alternate_names) {
            mapping.set(alt, primary.name);
          }
        }
      }
    }
  }

  return mapping;
}

// Cache for name variant mapping (avoid repeated DB calls)
let nameVariantMappingCache: Map<string, string> | null = null;
let nameVariantMappingTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

async function getNameVariantMapping(): Promise<Map<string, string>> {
  const now = Date.now();
  if (nameVariantMappingCache && (now - nameVariantMappingTimestamp) < CACHE_TTL_MS) {
    return nameVariantMappingCache;
  }
  nameVariantMappingCache = await buildNameVariantMapping();
  nameVariantMappingTimestamp = now;
  return nameVariantMappingCache;
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
 * Uses alternate_names and merged_into from alliance_roster for comprehensive history
 */
export async function getMemberHistory(memberName: string, limit = 30): Promise<RosterSnapshot[]> {
  const supabase = createClient();

  // Get all name variants for this member (including alternate names and merged entries)
  const nameVariants = await getMemberNameVariants(memberName);

  // Fetch history for all name variations
  const { data, error } = await supabase
    .from('roster_snapshots')
    .select('*')
    .in('member_name', nameVariants)
    .order('snapshot_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching member history:', error);
    return [];
  }

  if (data && data.length > 0) {
    // Deduplicate by date (keep only one entry per date, prefer current name)
    // Also filter out unreliable snapshot dates
    const byDate = new Map<string, RosterSnapshot>();
    for (const snap of data) {
      if (EXCLUDED_SNAPSHOT_DATES.includes(snap.snapshot_date)) continue;
      const existing = byDate.get(snap.snapshot_date);
      if (!existing || snap.member_name === memberName) {
        byDate.set(snap.snapshot_date, snap);
      }
    }
    return [...byDate.values()].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  }

  // Fallback: try normalized name matching if no results from alternate_names
  const normalizedTarget = normalizeName(memberName);

  const { data: allMembers } = await supabase
    .from('roster_snapshots')
    .select('member_name')
    .limit(1000);

  if (!allMembers) return [];

  const normalizedVariations = [...new Set(
    allMembers
      .map(m => m.member_name)
      .filter(name => normalizeName(name) === normalizedTarget)
  )];

  if (normalizedVariations.length === 0) return [];

  const { data: historyData, error: historyError } = await supabase
    .from('roster_snapshots')
    .select('*')
    .in('member_name', normalizedVariations)
    .order('snapshot_date', { ascending: true })
    .limit(limit);

  if (historyError) {
    console.error('Error fetching member history with variations:', historyError);
    return [];
  }

  // Filter out unreliable snapshot dates
  return (historyData || []).filter(snap => !EXCLUDED_SNAPSHOT_DATES.includes(snap.snapshot_date));
}

/**
 * Get top power/KP/Honor gainers between two dates
 * Uses alternate_names from alliance_roster to match members across name changes
 */
export async function getTopGainers(startDate: string, endDate: string, limit = 10): Promise<TopGainer[]> {
  const supabase = createClient();

  // Get name variant mapping for matching across name changes
  const nameMapping = await getNameVariantMapping();

  // Helper to get canonical name (checks mapping first, falls back to normalized)
  const getKey = (name: string): string => {
    return nameMapping.get(name) || normalizeName(name);
  };

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

  // Use canonical names for matching (handles name changes via alternate_names)
  const startMap = new Map(startData.map(d => [getKey(d.member_name), d]));
  const gainers: TopGainer[] = [];

  for (const end of endData) {
    const start = startMap.get(getKey(end.member_name));
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
  // All-time growth (from first entry to latest)
  firstKp: number;
  firstDate: string | null;
  currentKp: number;
  currentDate: string | null;
  allTimeKpGrowth: number;
  allTimeKpGrowthPercent: number;
  // Comparison growth (between selected dates)
  compareKp: number | null;
  compareDate: string | null;
  compareKpGrowth: number | null;
  compareKpGrowthPercent: number | null;
  // T4/T5 details for current
  currentT4: number;
  currentT5: number;
  // T4/T5 all-time growth
  firstT4: number;
  firstT5: number;
  allTimeT4Growth: number;
  allTimeT5Growth: number;
  // T4/T5 comparison growth
  compareT4: number | null;
  compareT5: number | null;
  compareT4Growth: number | null;
  compareT5Growth: number | null;
}

/**
 * Get KP growth - both all-time (from first entry) and comparison between dates
 * "Entry" means when a non-zero value was first recorded for that field
 * Uses alternate_names from alliance_roster to match members across name changes
 * @param compareDate - Optional date to compare against (defaults to ~7 days ago)
 */
export async function getKpGrowth(
  currentRoster: Array<{ name: string; kills: number; t4_kills: number; t5_kills: number }>,
  compareDate?: string | null,
  endDate?: string | null
): Promise<KpGrowth[]> {
  const supabase = createClient();

  // Get name variant mapping for matching across name changes
  const nameMapping = await getNameVariantMapping();

  // Helper to get canonical name (checks mapping first, falls back to normalized)
  const getKey = (name: string): string => {
    return nameMapping.get(name) || normalizeName(name);
  };

  // Get all snapshot dates (excluding unreliable ones)
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 1) return [];

  // Use provided endDate or default to most recent
  const currentDate = endDate && dates.includes(endDate) ? endDate : dates[0];

  // Use provided compareDate or default to ~7 days ago from the end date
  let effectiveCompareDate: string | null = compareDate ?? null;
  if (!effectiveCompareDate) {
    const weekAgoTarget = new Date(currentDate);
    weekAgoTarget.setDate(weekAgoTarget.getDate() - 7);
    const weekAgoStr = weekAgoTarget.toISOString().split('T')[0];
    effectiveCompareDate = dates.find(d => d <= weekAgoStr) || null;
  }

  // Get all snapshots for all members to find first entry with kills > 0
  const { data: allSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, kills, t4_kills, t5_kills')
    .gt('kills', 0)
    .order('snapshot_date', { ascending: true })
    .limit(5000);

  if (!allSnapshots) return [];

  // Build map of first entry date and values for each member (using canonical names)
  const firstEntryMap = new Map<string, { date: string; kills: number; t4: number; t5: number }>();
  for (const snap of allSnapshots) {
    const key = getKey(snap.member_name);
    if (!firstEntryMap.has(key)) {
      firstEntryMap.set(key, {
        date: snap.snapshot_date,
        kills: snap.kills || 0,
        t4: snap.t4_kills || 0,
        t5: snap.t5_kills || 0,
      });
    }
  }

  // Get current snapshot data
  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, kills, t4_kills, t5_kills')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .gt('kills', 0)
    .limit(2000);

  if (!currentData) return [];

  // Get comparison date snapshot data if available
  let compareMap = new Map<string, { kills: number; t4: number; t5: number }>();
  if (effectiveCompareDate) {
    const { data: compareData } = await supabase
      .from('roster_snapshots')
      .select('member_name, kills, t4_kills, t5_kills')
      .eq('snapshot_date', effectiveCompareDate)
      .gt('kills', 0)
      .limit(2000);

    if (compareData) {
      compareMap = new Map(compareData.map(d => [getKey(d.member_name), {
        kills: d.kills || 0,
        t4: d.t4_kills || 0,
        t5: d.t5_kills || 0,
      }]));
    }
  }

  const growth: KpGrowth[] = currentData
    .filter(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key);
      return firstEntry !== undefined;
    })
    .map(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key)!;
      const currentKp = m.kills || 0;
      const currentT4 = m.t4_kills || 0;
      const currentT5 = m.t5_kills || 0;
      const compare = compareMap.get(key) ?? null;

      const allTimeKpGrowth = currentKp - firstEntry.kills;
      const compareKpGrowth = compare !== null ? currentKp - compare.kills : null;

      return {
        name: m.member_name,
        firstKp: firstEntry.kills,
        firstDate: firstEntry.date,
        currentKp,
        currentDate,
        allTimeKpGrowth,
        allTimeKpGrowthPercent: firstEntry.kills > 0 ? (allTimeKpGrowth / firstEntry.kills) * 100 : 0,
        compareKp: compare?.kills ?? null,
        compareDate: effectiveCompareDate,
        compareKpGrowth,
        compareKpGrowthPercent: compare !== null && compare.kills > 0 ? (compareKpGrowth! / compare.kills) * 100 : null,
        currentT4,
        currentT5,
        firstT4: firstEntry.t4,
        firstT5: firstEntry.t5,
        allTimeT4Growth: currentT4 - firstEntry.t4,
        allTimeT5Growth: currentT5 - firstEntry.t5,
        compareT4: compare?.t4 ?? null,
        compareT5: compare?.t5 ?? null,
        compareT4Growth: compare !== null ? currentT4 - compare.t4 : null,
        compareT5Growth: compare !== null ? currentT5 - compare.t5 : null,
      };
    });

  return growth;
}

export interface PowerGrowth {
  name: string;
  // All-time growth (from first entry to latest)
  firstPower: number;
  firstDate: string | null;
  currentPower: number;
  currentDate: string | null;
  allTimeGrowth: number;
  allTimeGrowthPercent: number;
  // Comparison growth (between selected dates)
  comparePower: number | null;
  compareDate: string | null;
  compareGrowth: number | null;
  compareGrowthPercent: number | null;
}

/**
 * Get Power growth - both all-time (from first entry) and comparison between dates
 * "Entry" means when a non-zero value was first recorded for that field
 * Uses alternate_names from alliance_roster to match members across name changes
 * @param compareDate - Optional date to compare against (defaults to ~7 days ago)
 */
export async function getPowerGrowth(
  currentRoster: Array<{ name: string; power: number }>,
  compareDate?: string | null,
  endDate?: string | null
): Promise<PowerGrowth[]> {
  const supabase = createClient();

  // Get name variant mapping for matching across name changes
  const nameMapping = await getNameVariantMapping();

  // Helper to get canonical name (checks mapping first, falls back to normalized)
  const getKey = (name: string): string => {
    return nameMapping.get(name) || normalizeName(name);
  };

  // Get all snapshot dates (excluding unreliable ones)
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 1) return [];

  // Use provided endDate or default to most recent
  const currentDate = endDate && dates.includes(endDate) ? endDate : dates[0];

  // Use provided compareDate or default to ~7 days ago from the end date
  let effectiveCompareDate: string | null = compareDate ?? null;
  if (!effectiveCompareDate) {
    const weekAgoTarget = new Date(currentDate);
    weekAgoTarget.setDate(weekAgoTarget.getDate() - 7);
    const weekAgoStr = weekAgoTarget.toISOString().split('T')[0];
    effectiveCompareDate = dates.find(d => d <= weekAgoStr) || null;
  }

  // Get all snapshots for all members to find first entry with power > 0
  const { data: allSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, power')
    .gt('power', 0)
    .order('snapshot_date', { ascending: true })
    .limit(5000);

  if (!allSnapshots) return [];

  // Build map of first entry date and value for each member (using canonical names)
  const firstEntryMap = new Map<string, { date: string; value: number }>();
  for (const snap of allSnapshots) {
    const key = getKey(snap.member_name);
    if (!firstEntryMap.has(key)) {
      firstEntryMap.set(key, { date: snap.snapshot_date, value: snap.power });
    }
  }

  // Get current snapshot data
  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .gt('power', 0)
    .limit(2000);

  if (!currentData) return [];

  // Get comparison date snapshot data if available
  let compareMap = new Map<string, number>();
  if (effectiveCompareDate) {
    const { data: compareData } = await supabase
      .from('roster_snapshots')
      .select('member_name, power')
      .eq('snapshot_date', effectiveCompareDate)
      .gt('power', 0)
      .limit(2000);

    if (compareData) {
      compareMap = new Map(compareData.map(d => [getKey(d.member_name), d.power || 0]));
    }
  }

  const growth: PowerGrowth[] = currentData
    .filter(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key);
      return firstEntry !== undefined;
    })
    .map(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key)!;
      const currentPower = m.power || 0;
      const comparePower = compareMap.get(key) ?? null;

      const allTimeGrowth = currentPower - firstEntry.value;
      const compareGrowth = comparePower !== null ? currentPower - comparePower : null;

      return {
        name: m.member_name,
        firstPower: firstEntry.value,
        firstDate: firstEntry.date,
        currentPower,
        currentDate,
        allTimeGrowth,
        allTimeGrowthPercent: firstEntry.value > 0 ? (allTimeGrowth / firstEntry.value) * 100 : 0,
        comparePower,
        compareDate: effectiveCompareDate,
        compareGrowth,
        compareGrowthPercent: comparePower !== null && comparePower > 0 ? (compareGrowth! / comparePower) * 100 : null,
      };
    });

  return growth;
}

export interface HonorGrowth {
  name: string;
  // All-time growth (from first entry to latest)
  firstHonor: number;
  firstDate: string | null;
  currentHonor: number;
  currentDate: string | null;
  allTimeGrowth: number;
  allTimeGrowthPercent: number;
  // Comparison growth (between selected dates)
  compareHonor: number | null;
  compareDate: string | null;
  compareGrowth: number | null;
  compareGrowthPercent: number | null;
}

/**
 * Get Honor growth - both all-time (from first entry) and comparison between dates
 * "Entry" means when a non-zero value was first recorded for that field
 * Uses alternate_names from alliance_roster to match members across name changes
 * @param compareDate - Optional date to compare against (defaults to ~7 days ago)
 */
export async function getHonorGrowth(
  currentRoster: Array<{ name: string; honor_points: number }>,
  compareDate?: string | null,
  endDate?: string | null
): Promise<HonorGrowth[]> {
  const supabase = createClient();

  // Get name variant mapping for matching across name changes
  const nameMapping = await getNameVariantMapping();

  // Helper to get canonical name (checks mapping first, falls back to normalized)
  const getKey = (name: string): string => {
    return nameMapping.get(name) || normalizeName(name);
  };

  // Get all snapshot dates (excluding unreliable ones)
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 1) return [];

  // Use provided endDate or default to most recent
  const currentDate = endDate && dates.includes(endDate) ? endDate : dates[0];

  // Use provided compareDate or default to ~7 days ago from the end date
  let effectiveCompareDate: string | null = compareDate ?? null;
  if (!effectiveCompareDate) {
    const weekAgoTarget = new Date(currentDate);
    weekAgoTarget.setDate(weekAgoTarget.getDate() - 7);
    const weekAgoStr = weekAgoTarget.toISOString().split('T')[0];
    effectiveCompareDate = dates.find(d => d <= weekAgoStr) || null;
  }

  // Get all snapshots for all members to find first entry with honor > 0
  const { data: allSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, honor_points')
    .gt('honor_points', 0)
    .order('snapshot_date', { ascending: true })
    .limit(5000);

  if (!allSnapshots) return [];

  // Build map of first entry date and value for each member (using canonical names)
  const firstEntryMap = new Map<string, { date: string; value: number }>();
  for (const snap of allSnapshots) {
    const key = getKey(snap.member_name);
    if (!firstEntryMap.has(key)) {
      firstEntryMap.set(key, { date: snap.snapshot_date, value: snap.honor_points });
    }
  }

  // Get current snapshot data
  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, honor_points')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .gt('honor_points', 0)
    .limit(2000);

  if (!currentData) return [];

  // Get comparison date snapshot data if available
  let compareMap = new Map<string, number>();
  if (effectiveCompareDate) {
    const { data: compareData } = await supabase
      .from('roster_snapshots')
      .select('member_name, honor_points')
      .eq('snapshot_date', effectiveCompareDate)
      .gt('honor_points', 0)
      .limit(2000);

    if (compareData) {
      compareMap = new Map(compareData.map(d => [getKey(d.member_name), d.honor_points || 0]));
    }
  }

  const growth: HonorGrowth[] = currentData
    .filter(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key);
      // Only include if they have a first entry with honor > 0
      return firstEntry !== undefined;
    })
    .map(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key)!;
      const currentHonor = m.honor_points || 0;
      const compareHonor = compareMap.get(key) ?? null;

      const allTimeGrowth = currentHonor - firstEntry.value;
      const compareGrowth = compareHonor !== null ? currentHonor - compareHonor : null;

      return {
        name: m.member_name,
        firstHonor: firstEntry.value,
        firstDate: firstEntry.date,
        currentHonor,
        currentDate,
        allTimeGrowth,
        allTimeGrowthPercent: firstEntry.value > 0 ? (allTimeGrowth / firstEntry.value) * 100 : 0,
        compareHonor,
        compareDate: effectiveCompareDate,
        compareGrowth,
        compareGrowthPercent: compareHonor !== null && compareHonor > 0 ? (compareGrowth! / compareHonor) * 100 : null,
      };
    });

  return growth;
}

export interface GatheredGrowth {
  name: string;
  firstGathered: number;
  firstDate: string | null;
  currentGathered: number;
  currentDate: string | null;
  allTimeGrowth: number;
  allTimeGrowthPercent: number;
  compareGathered: number | null;
  compareDate: string | null;
  compareGrowth: number | null;
  compareGrowthPercent: number | null;
}

/**
 * Get Gathered growth - both all-time (from first entry) and comparison between dates
 */
export async function getGatheredGrowth(
  currentRoster: Array<{ name: string }>,
  compareDate?: string | null,
  endDate?: string | null
): Promise<GatheredGrowth[]> {
  const supabase = createClient();
  const nameMapping = await getNameVariantMapping();
  const getKey = (name: string): string => nameMapping.get(name) || normalizeName(name);

  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 1) return [];

  const currentDate = endDate && dates.includes(endDate) ? endDate : dates[0];

  let effectiveCompareDate: string | null = compareDate ?? null;
  if (!effectiveCompareDate) {
    const weekAgoTarget = new Date(currentDate);
    weekAgoTarget.setDate(weekAgoTarget.getDate() - 7);
    const weekAgoStr = weekAgoTarget.toISOString().split('T')[0];
    effectiveCompareDate = dates.find(d => d <= weekAgoStr) || null;
  }

  const { data: allSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, gathered')
    .gt('gathered', 0)
    .order('snapshot_date', { ascending: true })
    .limit(5000);

  if (!allSnapshots) return [];

  const firstEntryMap = new Map<string, { date: string; value: number }>();
  for (const snap of allSnapshots) {
    const key = getKey(snap.member_name);
    if (!firstEntryMap.has(key)) {
      firstEntryMap.set(key, { date: snap.snapshot_date, value: snap.gathered });
    }
  }

  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, gathered')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .gt('gathered', 0)
    .limit(2000);

  if (!currentData) return [];

  let compareMap = new Map<string, number>();
  if (effectiveCompareDate) {
    const { data: compareData } = await supabase
      .from('roster_snapshots')
      .select('member_name, gathered')
      .eq('snapshot_date', effectiveCompareDate)
      .gt('gathered', 0)
      .limit(2000);

    if (compareData) {
      compareMap = new Map(compareData.map(d => [getKey(d.member_name), d.gathered || 0]));
    }
  }

  return currentData
    .filter(m => firstEntryMap.has(getKey(m.member_name)))
    .map(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key)!;
      const currentGathered = m.gathered || 0;
      const compareGathered = compareMap.get(key) ?? null;
      const allTimeGrowth = currentGathered - firstEntry.value;
      const compareGrowth = compareGathered !== null ? currentGathered - compareGathered : null;

      return {
        name: m.member_name,
        firstGathered: firstEntry.value,
        firstDate: firstEntry.date,
        currentGathered,
        currentDate,
        allTimeGrowth,
        allTimeGrowthPercent: firstEntry.value > 0 ? (allTimeGrowth / firstEntry.value) * 100 : 0,
        compareGathered,
        compareDate: effectiveCompareDate,
        compareGrowth,
        compareGrowthPercent: compareGathered !== null && compareGathered > 0 ? (compareGrowth! / compareGathered) * 100 : null,
      };
    });
}

export interface HelpsGrowth {
  name: string;
  firstHelps: number;
  firstDate: string | null;
  currentHelps: number;
  currentDate: string | null;
  allTimeGrowth: number;
  allTimeGrowthPercent: number;
  compareHelps: number | null;
  compareDate: string | null;
  compareGrowth: number | null;
  compareGrowthPercent: number | null;
}

/**
 * Get Alliance Helps growth - both all-time (from first entry) and comparison between dates
 */
export async function getHelpsGrowth(
  currentRoster: Array<{ name: string }>,
  compareDate?: string | null,
  endDate?: string | null
): Promise<HelpsGrowth[]> {
  const supabase = createClient();
  const nameMapping = await getNameVariantMapping();
  const getKey = (name: string): string => nameMapping.get(name) || normalizeName(name);

  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 1) return [];

  const currentDate = endDate && dates.includes(endDate) ? endDate : dates[0];

  let effectiveCompareDate: string | null = compareDate ?? null;
  if (!effectiveCompareDate) {
    const weekAgoTarget = new Date(currentDate);
    weekAgoTarget.setDate(weekAgoTarget.getDate() - 7);
    const weekAgoStr = weekAgoTarget.toISOString().split('T')[0];
    effectiveCompareDate = dates.find(d => d <= weekAgoStr) || null;
  }

  const { data: allSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, alliance_helps')
    .gt('alliance_helps', 0)
    .order('snapshot_date', { ascending: true })
    .limit(5000);

  if (!allSnapshots) return [];

  const firstEntryMap = new Map<string, { date: string; value: number }>();
  for (const snap of allSnapshots) {
    const key = getKey(snap.member_name);
    if (!firstEntryMap.has(key)) {
      firstEntryMap.set(key, { date: snap.snapshot_date, value: snap.alliance_helps });
    }
  }

  const { data: currentData } = await supabase
    .from('roster_snapshots')
    .select('member_name, alliance_helps')
    .eq('snapshot_date', currentDate)
    .eq('is_active', true)
    .gt('alliance_helps', 0)
    .limit(2000);

  if (!currentData) return [];

  let compareMap = new Map<string, number>();
  if (effectiveCompareDate) {
    const { data: compareData } = await supabase
      .from('roster_snapshots')
      .select('member_name, alliance_helps')
      .eq('snapshot_date', effectiveCompareDate)
      .gt('alliance_helps', 0)
      .limit(2000);

    if (compareData) {
      compareMap = new Map(compareData.map(d => [getKey(d.member_name), d.alliance_helps || 0]));
    }
  }

  return currentData
    .filter(m => firstEntryMap.has(getKey(m.member_name)))
    .map(m => {
      const key = getKey(m.member_name);
      const firstEntry = firstEntryMap.get(key)!;
      const currentHelps = m.alliance_helps || 0;
      const compareHelps = compareMap.get(key) ?? null;
      const allTimeGrowth = currentHelps - firstEntry.value;
      const compareGrowth = compareHelps !== null ? currentHelps - compareHelps : null;

      return {
        name: m.member_name,
        firstHelps: firstEntry.value,
        firstDate: firstEntry.date,
        currentHelps,
        currentDate,
        allTimeGrowth,
        allTimeGrowthPercent: firstEntry.value > 0 ? (allTimeGrowth / firstEntry.value) * 100 : 0,
        compareHelps,
        compareDate: effectiveCompareDate,
        compareGrowth,
        compareGrowthPercent: compareHelps !== null && compareHelps > 0 ? (compareGrowth! / compareHelps) * 100 : null,
      };
    });
}

/**
 * Detect membership changes (joins/leaves) between snapshots
 */
export async function getMembershipChanges(limit = 20): Promise<MemberChange[]> {
  const supabase = createClient();

  // Get all snapshots ordered by date (paginated to avoid 1000-row limit)
  const snapshots = await fetchAllRows<{
    snapshot_date: string; member_name: string; is_active: boolean; power: number;
  }>((range) =>
    supabase
      .from('roster_snapshots')
      .select('snapshot_date, member_name, is_active, power')
      .eq('is_active', true)
      .order('snapshot_date', { ascending: true })
      .range(range.from, range.to)
  );

  if (snapshots.length === 0) return [];

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

  // Fetch all snapshots using pagination (Supabase default limit is 1000)
  let snapshots: {
    member_name: string;
    snapshot_date: string;
    kills: number | null;
    t4_kills: number | null;
    t5_kills: number | null;
    honor_points: number | null;
    power: number | null;
  }[];

  try {
    snapshots = await fetchAllRows((range) =>
      supabase
        .from('roster_snapshots')
        .select('member_name, snapshot_date, kills, t4_kills, t5_kills, honor_points, power')
        .order('snapshot_date', { ascending: false })
        .range(range.from, range.to)
    );
  } catch (err) {
    console.error('Error fetching snapshots for latest values:', err);
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

// --- Activity / AFK Detection ---

export type AfkScore = 'active' | 'low' | 'likely_afk' | 'afk';

export interface ActivityStatus {
  name: string;
  currentPower: number;
  powerDelta: number;
  powerDeltaPercent: number;
  gatheredDelta: number;
  helpsDelta: number;
  hasGatheredData: boolean;
  hasHelpsData: boolean;
  daysSinceChange: number;
  status: AfkScore;
}

/**
 * Detect AFK members by comparing snapshots over a window.
 * Uses power change as primary signal, gathered and alliance_helps as supplementary.
 */
export async function detectAfkMembers(
  currentRoster: Array<{ name: string; power: number }>,
  windowDays = 3,
): Promise<ActivityStatus[]> {
  const supabase = createClient();
  const nameMapping = await getNameVariantMapping();
  const getKey = (name: string): string => nameMapping.get(name) || normalizeName(name);

  // Get available snapshot dates
  const allDates = await getSnapshotDates();
  const dates = getFilteredSnapshotDates(allDates);
  if (dates.length < 2) return [];

  const endDate = dates[0]; // most recent

  // Find a start date ~windowDays ago
  const targetStart = new Date(endDate);
  targetStart.setDate(targetStart.getDate() - windowDays);
  const targetStr = targetStart.toISOString().split('T')[0];
  const startDate = dates.find(d => d <= targetStr) || dates[dates.length - 1];

  // Fetch end-date snapshots (power, gathered, alliance_helps)
  const { data: endData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power, gathered, alliance_helps')
    .eq('snapshot_date', endDate)
    .eq('is_active', true)
    .limit(2000);

  // Fetch start-date snapshots
  const { data: startData } = await supabase
    .from('roster_snapshots')
    .select('member_name, power, gathered, alliance_helps')
    .eq('snapshot_date', startDate)
    .eq('is_active', true)
    .limit(2000);

  if (!endData || !startData) return [];

  // Build start-date lookup by canonical name
  const startMap = new Map<string, { power: number; gathered: number; helps: number }>();
  for (const s of startData) {
    startMap.set(getKey(s.member_name), {
      power: s.power || 0,
      gathered: s.gathered || 0,
      helps: s.alliance_helps || 0,
    });
  }

  // Build end-date lookup
  const endMap = new Map<string, { power: number; gathered: number; helps: number }>();
  for (const e of endData) {
    endMap.set(getKey(e.member_name), {
      power: e.power || 0,
      gathered: e.gathered || 0,
      helps: e.alliance_helps || 0,
    });
  }

  // For daysSinceChange, fetch all snapshot dates' power for members with zero delta
  // We'll do this selectively after initial classification
  const zeroPowerKeys = new Set<string>();

  const results: ActivityStatus[] = [];

  for (const member of currentRoster) {
    const key = getKey(member.name);
    const end = endMap.get(key);
    const start = startMap.get(key);

    if (!end) continue; // No snapshot data for this member

    const currentPower = end.power;
    const startPower = start?.power ?? end.power;
    const powerDelta = currentPower - startPower;
    const powerDeltaPercent = startPower > 0 ? (powerDelta / startPower) * 100 : 0;

    const endGathered = end.gathered;
    const startGathered = start?.gathered ?? 0;
    const gatheredDelta = endGathered - startGathered;
    const hasGatheredData = endGathered > 0 || startGathered > 0;

    const endHelps = end.helps;
    const startHelps = start?.helps ?? 0;
    const helpsDelta = endHelps - startHelps;
    const hasHelpsData = endHelps > 0 || startHelps > 0;

    // Classify
    let status: AfkScore;
    if (powerDelta !== 0 || gatheredDelta > 0 || helpsDelta > 0) {
      status = 'active';
    } else if (!hasGatheredData && !hasHelpsData) {
      // No supplementary data to confirm — uncertain
      status = powerDelta === 0 ? 'low' : 'active';
    } else if (hasGatheredData && hasHelpsData && gatheredDelta === 0 && helpsDelta === 0) {
      status = 'afk';
    } else {
      status = 'likely_afk';
    }

    if (powerDelta === 0) zeroPowerKeys.add(key);

    results.push({
      name: member.name,
      currentPower,
      powerDelta,
      powerDeltaPercent,
      gatheredDelta,
      helpsDelta,
      hasGatheredData,
      hasHelpsData,
      daysSinceChange: 0, // will be computed below for zero-delta members
      status,
    });
  }

  // Compute daysSinceChange for members with zero power delta
  // Walk backward through available dates
  if (zeroPowerKeys.size > 0 && dates.length >= 2) {
    // Get up to 14 recent dates for backward walk
    const recentDates = dates.slice(0, Math.min(14, dates.length));

    // Fetch power snapshots for all recent dates
    const { data: recentSnaps } = await supabase
      .from('roster_snapshots')
      .select('member_name, snapshot_date, power')
      .in('snapshot_date', recentDates)
      .eq('is_active', true)
      .limit(recentDates.length * 2000);

    if (recentSnaps) {
      // Build: canonical_name -> date -> power
      const history = new Map<string, Map<string, number>>();
      for (const s of recentSnaps) {
        const k = getKey(s.member_name);
        if (!zeroPowerKeys.has(k)) continue;
        if (!history.has(k)) history.set(k, new Map());
        history.get(k)!.set(s.snapshot_date, s.power || 0);
      }

      // For each member, walk backward and count consecutive zero-change days
      for (const result of results) {
        if (result.powerDelta !== 0) continue;
        const k = getKey(result.name);
        const memberHistory = history.get(k);
        if (!memberHistory) continue;

        let days = 0;
        const latestPower = result.currentPower;
        for (let i = 1; i < recentDates.length; i++) {
          const datePower = memberHistory.get(recentDates[i]);
          if (datePower === undefined) continue;
          if (datePower === latestPower) {
            days++;
          } else {
            break;
          }
        }
        result.daysSinceChange = days;
      }
    }
  }

  return results;
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
