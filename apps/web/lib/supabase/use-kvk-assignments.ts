import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { KvkAssignment, AssignmentStatus } from '@/lib/kvk-map-types';

// ─── Assignments Hook ───────────────────────────────────────────────

export function useKvkAssignments(mapId: string | undefined) {
  const [assignments, setAssignments] = useState<KvkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async (isRefetch = false) => {
    if (!mapId) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    if (!isRefetch) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_assignments')
      .select('*')
      .eq('map_id', mapId)
      .order('assigned_at', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setAssignments((data || []) as KvkAssignment[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const refetch = useCallback(() => fetchAssignments(true), [fetchAssignments]);

  return { assignments, loading, error, refetch };
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function upsertAssignment(
  mapId: string,
  featureId: string,
  allianceId: string,
  data?: { status?: AssignmentStatus; priority?: number; notes?: string },
): Promise<KvkAssignment | null> {
  const { data: result, error } = await supabase
    .from('kvk_assignments')
    .upsert(
      {
        map_id: mapId,
        feature_id: featureId,
        alliance_id: allianceId,
        status: data?.status ?? 'planned',
        priority: data?.priority ?? 0,
        notes: data?.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select()
    .single();

  if (error) {
    console.error('Failed to upsert assignment:', error.message);
    return null;
  }
  return result as KvkAssignment;
}

export async function updateAssignment(
  assignmentId: string,
  updates: Partial<Pick<KvkAssignment, 'alliance_id' | 'status' | 'priority' | 'notes'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_assignments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', assignmentId);

  if (error) {
    console.error('Failed to update assignment:', error.message);
    return false;
  }
  return true;
}

export async function deleteAssignment(assignmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) {
    console.error('Failed to delete assignment:', error.message);
    return false;
  }
  return true;
}
