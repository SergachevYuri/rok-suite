import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { KvkStrategy, KvkAssignment, KvkAlliance } from '@/lib/kvk-map-types';

// ─── Strategies Hook ────────────────────────────────────────────────

export function useKvkStrategies(mapId: string | undefined) {
  const [strategies, setStrategies] = useState<KvkStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategies = useCallback(async (isRefetch = false) => {
    if (!mapId) {
      setStrategies([]);
      setLoading(false);
      return;
    }
    if (!isRefetch) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_strategies')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setStrategies((data || []) as KvkStrategy[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const refetch = useCallback(() => fetchStrategies(true), [fetchStrategies]);

  return { strategies, loading, error, refetch };
}

// ─── Utilities ──────────────────────────────────────────────────────

export function generateShareCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function saveStrategy(
  mapId: string,
  name: string,
  assignments: KvkAssignment[],
  alliances: KvkAlliance[],
  notes?: string,
): Promise<KvkStrategy | null> {
  const shareCode = generateShareCode();

  const { data, error } = await supabase
    .from('kvk_strategies')
    .insert({
      map_id: mapId,
      name,
      share_code: shareCode,
      assignments: JSON.parse(JSON.stringify(assignments)),
      alliance_snapshot: JSON.parse(JSON.stringify(alliances)),
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to save strategy:', error.message);
    return null;
  }
  return data as KvkStrategy;
}

export async function loadStrategyByShareCode(code: string): Promise<KvkStrategy | null> {
  const { data, error } = await supabase
    .from('kvk_strategies')
    .select('*')
    .eq('share_code', code)
    .single();

  if (error) {
    console.error('Failed to load strategy:', error.message);
    return null;
  }
  return data as KvkStrategy;
}

export async function deleteStrategy(strategyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_strategies')
    .delete()
    .eq('id', strategyId);

  if (error) {
    console.error('Failed to delete strategy:', error.message);
    return false;
  }
  return true;
}
