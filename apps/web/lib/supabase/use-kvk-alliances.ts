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
