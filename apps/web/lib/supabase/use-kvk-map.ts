import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { KvkMap, KvkMapFeature, KvkMapZone } from '@/lib/kvk-map-types';

// ─── Active Map Hook ────────────────────────────────────────────────

export function useActiveKvkMap() {
  const [map, setMap] = useState<KvkMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMap = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_maps')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (err) {
      setError(err.message);
    } else {
      setMap(data as KvkMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  return { map, loading, error, refetch: fetchMap };
}

// ─── Features Hook ──────────────────────────────────────────────────

export function useKvkMapFeatures(mapId: string | undefined) {
  const [features, setFeatures] = useState<KvkMapFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async (isRefetch = false) => {
    if (!mapId) {
      setFeatures([]);
      setLoading(false);
      return;
    }
    if (!isRefetch) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_map_features')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setFeatures((data || []) as KvkMapFeature[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const refetch = useCallback(() => fetchFeatures(true), [fetchFeatures]);

  return { features, loading, error, refetch };
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function createMapFeature(
  mapId: string,
  featureType: string,
  x: number,
  y: number,
  defaults?: { level?: number | null; zone?: number | null },
): Promise<KvkMapFeature | null> {
  const { data, error } = await supabase
    .from('kvk_map_features')
    .insert({
      map_id: mapId,
      feature_type: featureType,
      x,
      y,
      ...(defaults?.level != null && { level: defaults.level }),
      ...(defaults?.zone != null && { zone: defaults.zone }),
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create map feature:', error.message);
    return null;
  }
  return data as KvkMapFeature;
}

export async function updateMapFeature(
  featureId: string,
  updates: Partial<Pick<KvkMapFeature, 'name' | 'buff_name' | 'buff_value' | 'buff_description' | 'zone' | 'level' | 'x' | 'y'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_map_features')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', featureId);

  if (error) {
    console.error('Failed to update map feature:', error.message);
    return false;
  }
  return true;
}

export async function deleteMapFeature(featureId: string): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_map_features')
    .delete()
    .eq('id', featureId);

  if (error) {
    console.error('Failed to delete map feature:', error.message);
    return false;
  }
  return true;
}

export async function updateFeaturePosition(
  featureId: string,
  x: number,
  y: number,
): Promise<boolean> {
  return updateMapFeature(featureId, { x, y });
}

// ─── Zone Mutations ────────────────────────────────────────────────

export async function updateMapZone(
  zoneId: string,
  updates: Partial<Pick<KvkMapZone, 'polygon' | 'name' | 'color' | 'opacity'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_map_zones')
    .update(updates)
    .eq('id', zoneId);

  if (error) {
    console.error('Failed to update map zone:', error.message);
    return false;
  }
  return true;
}

// ─── Zones Hook ────────────────────────────────────────────────────

export function useKvkMapZones(mapId: string | undefined) {
  const [zones, setZones] = useState<KvkMapZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchZones = useCallback(async (isRefetch = false) => {
    if (!mapId) {
      setZones([]);
      setLoading(false);
      return;
    }
    if (!isRefetch) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kvk_map_zones')
      .select('*')
      .eq('map_id', mapId)
      .order('zone_number', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setZones((data || []) as KvkMapZone[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const refetch = useCallback(() => fetchZones(true), [fetchZones]);

  return { zones, loading, error, refetch };
}
