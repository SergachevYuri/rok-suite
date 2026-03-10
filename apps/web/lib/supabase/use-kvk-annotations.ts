import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type {
  KvkMapArrow,
  KvkMapDrawing,
  KvkMapLabel,
  KvkZoneNote,
  KvkZoneAction,
  ArrowType,
  DashStyle,
} from '@/lib/kvk-map-types';

// ─── Arrows Hook ───────────────────────────────────────────────────

export function useKvkArrows(mapId: string | undefined) {
  const [arrows, setArrows] = useState<KvkMapArrow[]>([]);

  const fetch = useCallback(async () => {
    if (!mapId) { setArrows([]); return; }
    const { data } = await supabase
      .from('kvk_map_arrows')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: true });
    setArrows((data || []) as KvkMapArrow[]);
  }, [mapId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { arrows, refetch: fetch };
}

export async function createArrow(
  mapId: string,
  data: {
    waypoints: [number, number][];
    arrow_type?: ArrowType;
    color_override?: string;
    dash_style?: DashStyle;
    weight?: number;
    label?: string;
    alliance_id?: string;
    stage?: number;
    created_by?: string;
  },
): Promise<KvkMapArrow | null> {
  const { data: result, error } = await supabase
    .from('kvk_map_arrows')
    .insert({ map_id: mapId, ...data })
    .select()
    .single();
  if (error) { console.error('Failed to create arrow:', error.message); return null; }
  return result as KvkMapArrow;
}

export async function updateArrow(
  id: string,
  updates: Partial<Pick<KvkMapArrow, 'waypoints' | 'arrow_type' | 'label' | 'color_override' | 'dash_style' | 'weight'>>,
): Promise<boolean> {
  const { error } = await supabase.from('kvk_map_arrows').update(updates).eq('id', id);
  if (error) { console.error('Failed to update arrow:', error.message); return false; }
  return true;
}

export async function deleteArrow(id: string): Promise<boolean> {
  const { error } = await supabase.from('kvk_map_arrows').delete().eq('id', id);
  if (error) { console.error('Failed to delete arrow:', error.message); return false; }
  return true;
}

// ─── Drawings Hook ─────────────────────────────────────────────────

export function useKvkDrawings(mapId: string | undefined) {
  const [drawings, setDrawings] = useState<KvkMapDrawing[]>([]);

  const fetch = useCallback(async () => {
    if (!mapId) { setDrawings([]); return; }
    const { data } = await supabase
      .from('kvk_map_drawings')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: true });
    setDrawings((data || []) as KvkMapDrawing[]);
  }, [mapId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { drawings, refetch: fetch };
}

export async function createDrawing(
  mapId: string,
  data: {
    points: [number, number][];
    color?: string;
    weight?: number;
    opacity?: number;
    stage?: number;
    created_by?: string;
  },
): Promise<KvkMapDrawing | null> {
  const { data: result, error } = await supabase
    .from('kvk_map_drawings')
    .insert({ map_id: mapId, ...data })
    .select()
    .single();
  if (error) { console.error('Failed to create drawing:', error.message); return null; }
  return result as KvkMapDrawing;
}

export async function deleteDrawing(id: string): Promise<boolean> {
  const { error } = await supabase.from('kvk_map_drawings').delete().eq('id', id);
  if (error) { console.error('Failed to delete drawing:', error.message); return false; }
  return true;
}

// ─── Labels Hook ───────────────────────────────────────────────────

export function useKvkLabels(mapId: string | undefined) {
  const [labels, setLabels] = useState<KvkMapLabel[]>([]);

  const fetch = useCallback(async () => {
    if (!mapId) { setLabels([]); return; }
    const { data } = await supabase
      .from('kvk_map_labels')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: true });
    setLabels((data || []) as KvkMapLabel[]);
  }, [mapId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { labels, refetch: fetch };
}

export async function createLabel(
  mapId: string,
  data: {
    x: number;
    y: number;
    text: string;
    color?: string;
    font_size?: number;
    stage?: number;
    created_by?: string;
  },
): Promise<KvkMapLabel | null> {
  const { data: result, error } = await supabase
    .from('kvk_map_labels')
    .insert({ map_id: mapId, ...data })
    .select()
    .single();
  if (error) { console.error('Failed to create label:', error.message); return null; }
  return result as KvkMapLabel;
}

export async function updateLabel(
  id: string,
  updates: Partial<Pick<KvkMapLabel, 'x' | 'y' | 'text' | 'color' | 'font_size'>>,
): Promise<boolean> {
  const { error } = await supabase.from('kvk_map_labels').update(updates).eq('id', id);
  if (error) { console.error('Failed to update label:', error.message); return false; }
  return true;
}

export async function deleteLabel(id: string): Promise<boolean> {
  const { error } = await supabase.from('kvk_map_labels').delete().eq('id', id);
  if (error) { console.error('Failed to delete label:', error.message); return false; }
  return true;
}

// ─── Zone Notes Hook ───────────────────────────────────────────────

export function useKvkZoneNotes(mapId: string | undefined) {
  const [notes, setNotes] = useState<KvkZoneNote[]>([]);

  const fetch = useCallback(async () => {
    if (!mapId) { setNotes([]); return; }
    const { data } = await supabase
      .from('kvk_zone_notes')
      .select('*')
      .eq('map_id', mapId);
    setNotes((data || []) as KvkZoneNote[]);
  }, [mapId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { notes, refetch: fetch };
}

export async function upsertZoneNote(
  mapId: string,
  zoneId: string,
  stage: number,
  content: string,
  updatedBy?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_zone_notes')
    .upsert(
      { map_id: mapId, zone_id: zoneId, stage, content, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'zone_id,stage' },
    );
  if (error) { console.error('Failed to upsert zone note:', error.message); return false; }
  return true;
}

// ─── Zone Actions Hook ─────────────────────────────────────────────

export function useKvkZoneActions(mapId: string | undefined) {
  const [actions, setActions] = useState<KvkZoneAction[]>([]);

  const fetch = useCallback(async () => {
    if (!mapId) { setActions([]); return; }
    const { data } = await supabase
      .from('kvk_zone_actions')
      .select('*')
      .eq('map_id', mapId)
      .order('sort_order', { ascending: true });
    setActions((data || []) as KvkZoneAction[]);
  }, [mapId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { actions, refetch: fetch };
}

export async function createZoneAction(
  mapId: string,
  zoneId: string,
  stage: number,
  label: string,
  sortOrder: number,
  createdBy?: string,
): Promise<KvkZoneAction | null> {
  const { data, error } = await supabase
    .from('kvk_zone_actions')
    .insert({ map_id: mapId, zone_id: zoneId, stage, label, sort_order: sortOrder, created_by: createdBy })
    .select()
    .single();
  if (error) { console.error('Failed to create zone action:', error.message); return null; }
  return data as KvkZoneAction;
}

export async function toggleZoneAction(
  id: string,
  isChecked: boolean,
  checkedBy?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_zone_actions')
    .update({
      is_checked: isChecked,
      checked_by: isChecked ? checkedBy : null,
      checked_at: isChecked ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) { console.error('Failed to toggle zone action:', error.message); return false; }
  return true;
}

export async function deleteZoneAction(id: string): Promise<boolean> {
  const { error } = await supabase.from('kvk_zone_actions').delete().eq('id', id);
  if (error) { console.error('Failed to delete zone action:', error.message); return false; }
  return true;
}
