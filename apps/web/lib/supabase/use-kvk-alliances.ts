import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { KvkAlliance, AllianceRole } from '@/lib/kvk-map-types';

// ─── Alliances Hook ─────────────────────────────────────────────────

export function useKvkAlliances(mapId: string | undefined) {
  const [alliances, setAlliances] = useState<KvkAlliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlliances = useCallback(async (isRefetch = false) => {
    if (!mapId) {
      setAlliances([]);
      setLoading(false);
      return;
    }
    if (!isRefetch) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_alliances')
      .select('*')
      .eq('map_id', mapId)
      .order('sort_order', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setAlliances((data || []) as KvkAlliance[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchAlliances();
  }, [fetchAlliances]);

  const refetch = useCallback(() => fetchAlliances(true), [fetchAlliances]);

  return { alliances, loading, error, refetch };
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function createAlliance(
  mapId: string,
  data: { tag: string; name: string; role: AllianceRole; color: string; sort_order?: number },
): Promise<KvkAlliance | null> {
  const { data: result, error } = await supabase
    .from('kvk_alliances')
    .insert({ map_id: mapId, ...data })
    .select()
    .single();

  if (error) {
    console.error('Failed to create alliance:', error.message);
    return null;
  }
  return result as KvkAlliance;
}

export async function updateAlliance(
  allianceId: string,
  updates: Partial<Pick<KvkAlliance, 'tag' | 'name' | 'role' | 'color' | 'sort_order'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_alliances')
    .update(updates)
    .eq('id', allianceId);

  if (error) {
    console.error('Failed to update alliance:', error.message);
    return false;
  }
  return true;
}

export async function deleteAlliance(allianceId: string): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_alliances')
    .delete()
    .eq('id', allianceId);

  if (error) {
    console.error('Failed to delete alliance:', error.message);
    return false;
  }
  return true;
}

// ─── Roster alliance helpers ────────────────────────────────────────

const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

export interface RosterAllianceSummary {
  tag: string;
  memberCount: number;
  totalPower: number;
}

/**
 * Fetch all alliances from roster data with member counts and total power.
 * Sorted by total power descending.
 */
export async function fetchAllRosterAlliances(): Promise<RosterAllianceSummary[]> {
  const { data, error } = await supabase
    .from('alliance_roster')
    .select('alliance, power')
    .eq('is_active', true)
    .not('alliance', 'is', null);

  if (error || !data) {
    console.error('Failed to fetch roster alliances:', error?.message);
    return [];
  }

  const stats = new Map<string, { count: number; power: number }>();
  for (const row of data) {
    if (!row.alliance) continue;
    const prev = stats.get(row.alliance) || { count: 0, power: 0 };
    stats.set(row.alliance, { count: prev.count + 1, power: prev.power + (row.power || 0) });
  }

  return [...stats.entries()]
    .map(([tag, s]) => ({ tag, memberCount: s.count, totalPower: s.power }))
    .sort((a, b) => b.totalPower - a.totalPower);
}

/**
 * Fetch the top N alliances by total member power from alliance_roster.
 * Returns them in a shape ready to be inserted as kvk_alliances.
 */
export async function fetchTopAlliancesFromRoster(
  count: number = 3,
): Promise<{ tag: string; name: string; role: AllianceRole; color: string }[]> {
  const { data, error } = await supabase
    .from('alliance_roster')
    .select('alliance, power')
    .eq('is_active', true)
    .not('alliance', 'is', null);

  if (error || !data) {
    console.error('Failed to fetch roster alliances:', error?.message);
    return [];
  }

  // Aggregate power by alliance tag
  const totals = new Map<string, number>();
  for (const row of data) {
    if (!row.alliance) continue;
    totals.set(row.alliance, (totals.get(row.alliance) || 0) + (row.power || 0));
  }

  // Sort by total power descending, take top N
  const sorted = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);

  return sorted.map(([tag], i) => ({
    tag,
    name: tag,
    role: (i === 0 ? 'top' : 'support') as AllianceRole,
    color: DEFAULT_COLORS[i] || DEFAULT_COLORS[DEFAULT_COLORS.length - 1],
  }));
}
