import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AllianceConfig, PlayerAssignment } from '@/lib/kingdom/types';

export interface SorterVersionSummary {
  id: number;
  name: string;
  created_at: string;
  player_count: number;
  move_count: number;
  stay_count: number;
  unassigned_count: number;
}

export interface SorterVersion extends SorterVersionSummary {
  scan_id: number;
  configs: AllianceConfig[];
  exempt_ids: number[];
  assignments: PlayerAssignment[];
}

/**
 * Hook to fetch the list of saved sorter versions for a given scan.
 * Only fetches summary columns (no large JSONB payloads).
 */
export function useSorterVersions(scanId: number | null) {
  const [versions, setVersions] = useState<SorterVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!scanId) {
      setVersions([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('sorter_versions')
      .select('id, name, created_at, player_count, move_count, stay_count, unassigned_count')
      .eq('scan_id', scanId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch sorter versions:', error);
    } else {
      setVersions((data as SorterVersionSummary[]) || []);
    }
    setLoading(false);
  }, [scanId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return { versions, loading, refetch: fetchVersions };
}

/**
 * Save (or overwrite) a named sorter version for the given scan.
 * Returns the new version ID, or null on error.
 */
export async function saveSorterVersion(
  scanId: number,
  name: string,
  configs: AllianceConfig[],
  assignments: PlayerAssignment[],
  exemptIds: number[],
): Promise<number | null> {
  const playerCount = assignments.length;
  const moveCount = assignments.filter(a => a.status === 'MOVE').length;
  const stayCount = assignments.filter(a => a.status === 'STAY').length;
  const unassignedCount = assignments.filter(a => a.status === 'UNASSIGNED').length;

  const { data, error } = await supabase
    .from('sorter_versions')
    .upsert(
      {
        scan_id: scanId,
        name,
        configs,
        exempt_ids: exemptIds,
        assignments,
        player_count: playerCount,
        move_count: moveCount,
        stay_count: stayCount,
        unassigned_count: unassignedCount,
      },
      { onConflict: 'scan_id,name' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save sorter version:', error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Load a full sorter version by ID (including configs, assignments, exempt_ids).
 */
export async function loadSorterVersion(versionId: number): Promise<SorterVersion | null> {
  const { data, error } = await supabase
    .from('sorter_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error) {
    console.error('Failed to load sorter version:', error);
    return null;
  }
  return data as SorterVersion;
}

/**
 * Delete a sorter version by ID.
 */
export async function deleteSorterVersion(versionId: number): Promise<boolean> {
  const { error } = await supabase
    .from('sorter_versions')
    .delete()
    .eq('id', versionId);

  if (error) {
    console.error('Failed to delete sorter version:', error);
    return false;
  }
  return true;
}
