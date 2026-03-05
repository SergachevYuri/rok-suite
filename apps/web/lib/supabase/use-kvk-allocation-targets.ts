import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { KvkAllocationTarget } from '@/lib/kvk-map-types';

// ─── Allocation Targets Hook ────────────────────────────────────────

export function useKvkAllocationTargets(mapId: string | undefined) {
  const [targets, setTargets] = useState<KvkAllocationTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTargets = useCallback(async (isRefetch = false) => {
    if (!mapId) {
      setTargets([]);
      setLoading(false);
      return;
    }
    if (!isRefetch) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_allocation_targets')
      .select('*')
      .eq('map_id', mapId)
      .order('feature_group', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setTargets((data || []) as KvkAllocationTarget[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const refetch = useCallback(() => fetchTargets(true), [fetchTargets]);

  return { targets, loading, error, refetch };
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function upsertAllocationTarget(
  mapId: string,
  allianceId: string,
  featureGroup: string,
  targetCount: number,
): Promise<KvkAllocationTarget | null> {
  const { data, error } = await supabase
    .from('kvk_allocation_targets')
    .upsert(
      {
        map_id: mapId,
        alliance_id: allianceId,
        feature_group: featureGroup,
        target_count: targetCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'map_id,alliance_id,feature_group' },
    )
    .select()
    .single();

  if (error) {
    console.error('Failed to upsert allocation target:', error.message);
    return null;
  }
  return data as KvkAllocationTarget;
}

export async function deleteAllocationTarget(
  mapId: string,
  allianceId: string,
  featureGroup: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_allocation_targets')
    .delete()
    .eq('map_id', mapId)
    .eq('alliance_id', allianceId)
    .eq('feature_group', featureGroup);

  if (error) {
    console.error('Failed to delete allocation target:', error.message);
    return false;
  }
  return true;
}
