/**
 * Hook and helpers for MGE (Mightiest Governor Event) management
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export interface MgeSelection {
  id: number;
  mge_event_id: number;
  member_name: string;
  ranking_tier: string;
  power_cap: number | null;
  reason: string | null;
  sort_order: number;
  created_at: string;
}

export interface MgeEvent {
  id: number;
  event_date: string;
  focused_commander: string;
  notes: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  mge_selections: MgeSelection[];
}

export const RANKING_TIERS = [
  '1st Place', '2nd Place', '3rd Place', '4th Place', '5th Place',
  '6th Place', '7th Place', '8th Place', '9th Place', '10th Place',
  'Free for All',
] as const;

export function useMgeEvents() {
  const [events, setEvents] = useState<MgeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('mge_events')
      .select('*, mge_selections(*)')
      .order('event_date', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      // Sort selections within each event by sort_order
      const sorted = (data || []).map((evt: MgeEvent) => ({
        ...evt,
        mge_selections: (evt.mge_selections || []).sort(
          (a: MgeSelection, b: MgeSelection) => a.sort_order - b.sort_order
        ),
      }));
      setEvents(sorted);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

export async function createMgeEvent(
  event_date: string,
  focused_commander: string,
  notes?: string
): Promise<MgeEvent | null> {
  const { data, error } = await supabase
    .from('mge_events')
    .insert([{ event_date, focused_commander, notes: notes || null }])
    .select()
    .single();

  if (error) {
    console.error('Failed to create MGE event:', error.message);
    return null;
  }
  return { ...data, is_published: false, mge_selections: [] };
}

export async function updateMgeEvent(
  id: number,
  fields: Partial<Pick<MgeEvent, 'event_date' | 'focused_commander' | 'notes' | 'is_published'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('mge_events')
    .update(fields)
    .eq('id', id);

  if (error) {
    console.error('Failed to update MGE event:', error.message);
    return false;
  }
  return true;
}

export async function deleteMgeEvent(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('mge_events')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete MGE event:', error.message);
    return false;
  }
  return true;
}

export async function addSelection(
  mge_event_id: number,
  member_name: string,
  ranking_tier: string,
  power_cap?: number | null,
  reason?: string | null
): Promise<MgeSelection | null> {
  // Get current max sort_order for this event
  const { data: existing } = await supabase
    .from('mge_selections')
    .select('sort_order')
    .eq('mge_event_id', mge_event_id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from('mge_selections')
    .insert([{
      mge_event_id,
      member_name,
      ranking_tier,
      power_cap: power_cap || null,
      reason: reason || null,
      sort_order: nextOrder,
    }])
    .select()
    .single();

  if (error) {
    console.error('Failed to add selection:', error.message);
    return null;
  }
  return data;
}

export async function updateSelection(
  id: number,
  fields: Partial<Pick<MgeSelection, 'ranking_tier' | 'power_cap' | 'reason' | 'sort_order'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('mge_selections')
    .update(fields)
    .eq('id', id);

  if (error) {
    console.error('Failed to update selection:', error.message);
    return false;
  }
  return true;
}

export async function removeSelection(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('mge_selections')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to remove selection:', error.message);
    return false;
  }
  return true;
}
