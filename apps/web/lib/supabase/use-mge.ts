/**
 * Hook and helpers for MGE (Mightiest Governor Event) management
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

// ─── Types ──────────────────────────────────────────────────────────

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

export interface MgeEventCommander {
  id: number;
  mge_event_id: number;
  commander_name: string;
  is_focus: boolean;
  sort_order: number;
}

export interface MgeRankTier {
  id: number;
  mge_event_id: number;
  tier_label: string;
  point_cap: number | null;
  is_ffa: boolean;
  sort_order: number;
  reward_heads: number | null;
}

export type MgeEventStatus = 'draft' | 'open' | 'reviewing' | 'finalized' | 'completed';
export type MgeApplicationStatus = 'pending' | 'approved' | 'waitlisted' | 'declined' | 'withdrawn';

export interface MgeApplication {
  id: number;
  mge_event_id: number;
  applicant_name: string;
  applicant_alliance: string | null;
  applicant_power: number | null;
  commander_name: string;
  commander_level: number | null;
  skill_levels: number[] | null;
  commander_stars: number | null;
  preferred_tier: string | null;
  max_tier: string | null;
  notes: string | null;
  status: MgeApplicationStatus;
  officer_notes: string | null;
  assigned_tier: string | null;
  decided_at: string | null;
  screenshot_url: string | null;
  equipment_rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface MgeEvent {
  id: number;
  event_date: string;
  focused_commander: string;
  notes: string | null;
  is_published: boolean;
  status: MgeEventStatus;
  application_deadline: string | null;
  created_at: string;
  updated_at: string;
  mge_selections: MgeSelection[];
  mge_event_commanders: MgeEventCommander[];
  mge_rank_tiers: MgeRankTier[];
  mge_applications: MgeApplication[];
}

export const RANKING_TIERS = [
  '1st Place', '2nd Place', '3rd Place', '4th Place', '5th Place',
  '6th Place', '7th Place', '8th Place', '9th Place', '10th Place',
] as const;

// ─── Main Hook ──────────────────────────────────────────────────────

export function useMgeEvents() {
  const [events, setEvents] = useState<MgeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('mge_events')
      .select('*, mge_selections(*), mge_event_commanders(*), mge_rank_tiers(*), mge_applications(*)')
      .order('event_date', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      // Sort nested arrays
      const sorted = (data || []).map((evt: MgeEvent) => ({
        ...evt,
        status: evt.status || (evt.is_published ? 'completed' : 'draft'),
        mge_selections: (evt.mge_selections || []).sort(
          (a: MgeSelection, b: MgeSelection) => a.sort_order - b.sort_order
        ),
        mge_event_commanders: (evt.mge_event_commanders || []).sort(
          (a: MgeEventCommander, b: MgeEventCommander) => a.sort_order - b.sort_order
        ),
        mge_rank_tiers: (evt.mge_rank_tiers || []).sort(
          (a: MgeRankTier, b: MgeRankTier) => a.sort_order - b.sort_order
        ),
        mge_applications: evt.mge_applications || [],
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

// ─── Event CRUD ─────────────────────────────────────────────────────

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
  return {
    ...data,
    status: data.status || 'draft',
    mge_selections: [],
    mge_event_commanders: [],
    mge_rank_tiers: [],
    mge_applications: [],
  };
}

/** Create event with commanders and tiers in one go */
export async function createMgeEventFull(
  event_date: string,
  commanders: { name: string; isFocus: boolean }[],
  tiers: { label: string; pointCap: number | null; isFfa: boolean; rewardHeads?: number | null }[],
  notes?: string,
  deadline?: string
): Promise<MgeEvent | null> {
  const focused = commanders.map(c => c.name).join(', ');

  const { data: evt, error } = await supabase
    .from('mge_events')
    .insert([{
      event_date,
      focused_commander: focused,
      notes: notes || null,
      application_deadline: deadline || null,
      status: 'draft',
    }])
    .select()
    .single();

  if (error || !evt) {
    console.error('Failed to create MGE event:', error?.message);
    return null;
  }

  // Insert commanders
  if (commanders.length > 0) {
    const { error: cmdErr } = await supabase.from('mge_event_commanders').insert(
      commanders.map((c, i) => ({
        mge_event_id: evt.id,
        commander_name: c.name,
        is_focus: c.isFocus,
        sort_order: i,
      }))
    );
    if (cmdErr) console.error('Failed to insert commanders:', cmdErr.message);
  }

  // Insert tiers
  if (tiers.length > 0) {
    const { error: tierErr } = await supabase.from('mge_rank_tiers').insert(
      tiers.map((t, i) => ({
        mge_event_id: evt.id,
        tier_label: t.label,
        point_cap: t.pointCap,
        is_ffa: t.isFfa,
        sort_order: i,
        reward_heads: t.rewardHeads ?? null,
      }))
    );
    if (tierErr) console.error('Failed to insert tiers:', tierErr.message);
  }

  return {
    ...evt,
    status: evt.status || 'draft',
    mge_selections: [],
    mge_event_commanders: commanders.map((c, i) => ({
      id: 0,
      mge_event_id: evt.id,
      commander_name: c.name,
      is_focus: c.isFocus,
      sort_order: i,
    })),
    mge_rank_tiers: tiers.map((t, i) => ({
      id: 0,
      mge_event_id: evt.id,
      tier_label: t.label,
      point_cap: t.pointCap,
      is_ffa: t.isFfa,
      sort_order: i,
      reward_heads: t.rewardHeads ?? null,
    })),
    mge_applications: [],
  };
}

export async function updateMgeEvent(
  id: number,
  fields: Partial<Pick<MgeEvent, 'event_date' | 'focused_commander' | 'notes' | 'is_published' | 'status' | 'application_deadline'>>
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

export async function updateMgeEventStatus(id: number, status: MgeEventStatus): Promise<boolean> {
  const updates: Record<string, unknown> = { status };
  // Sync is_published for backward compat
  if (status === 'finalized' || status === 'completed') {
    updates.is_published = true;
  } else if (status === 'draft') {
    updates.is_published = false;
  }
  const { error } = await supabase.from('mge_events').update(updates).eq('id', id);
  if (error) {
    console.error('Failed to update event status:', error.message);
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

// ─── Commanders CRUD ────────────────────────────────────────────────

export async function updateEventCommanders(
  eventId: number,
  commanders: { name: string; isFocus: boolean }[]
): Promise<boolean> {
  // Delete existing and re-insert
  await supabase.from('mge_event_commanders').delete().eq('mge_event_id', eventId);
  if (commanders.length === 0) return true;

  const { error } = await supabase.from('mge_event_commanders').insert(
    commanders.map((c, i) => ({
      mge_event_id: eventId,
      commander_name: c.name,
      is_focus: c.isFocus,
      sort_order: i,
    }))
  );
  if (error) {
    console.error('Failed to update commanders:', error.message);
    return false;
  }
  return true;
}

// ─── Tiers CRUD ─────────────────────────────────────────────────────

export async function updateEventTiers(
  eventId: number,
  tiers: { label: string; pointCap: number | null; isFfa: boolean; rewardHeads?: number | null }[]
): Promise<boolean> {
  await supabase.from('mge_rank_tiers').delete().eq('mge_event_id', eventId);
  if (tiers.length === 0) return true;

  const { error } = await supabase.from('mge_rank_tiers').insert(
    tiers.map((t, i) => ({
      mge_event_id: eventId,
      tier_label: t.label,
      point_cap: t.pointCap,
      is_ffa: t.isFfa,
      sort_order: i,
      reward_heads: t.rewardHeads ?? null,
    }))
  );
  if (error) {
    console.error('Failed to update tiers:', error.message);
    return false;
  }
  return true;
}

// ─── Selection CRUD (existing, kept for backward compat) ────────────

export async function addSelection(
  mge_event_id: number,
  member_name: string,
  ranking_tier: string,
  power_cap?: number | null,
  reason?: string | null
): Promise<MgeSelection | null> {
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

// ─── Screenshot Upload ──────────────────────────────────────────────

export async function uploadMgeScreenshot(
  file: File,
  eventId: number,
  applicantName: string
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'png';
  const safeName = applicantName.replace(/[^a-zA-Z0-9]/g, '_');
  const path = `${eventId}/${safeName}_${Date.now()}.${ext}`;

  const { error } = await supabase
    .storage
    .from('mge-screenshots')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error('Failed to upload screenshot:', error.message);
    return null;
  }

  const { data } = supabase.storage.from('mge-screenshots').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Application CRUD ───────────────────────────────────────────────

export async function submitApplication(
  eventId: number,
  data: {
    applicant_name: string;
    applicant_alliance?: string | null;
    applicant_power?: number | null;
    commander_name: string;
    commander_level?: number | null;
    skill_levels?: number[] | null;
    commander_stars?: number | null;
    preferred_tier?: string | null;
    max_tier?: string | null;
    notes?: string | null;
    screenshot_url?: string | null;
  }
): Promise<MgeApplication | null> {
  const { data: result, error } = await supabase
    .from('mge_applications')
    .insert([{
      mge_event_id: eventId,
      applicant_name: data.applicant_name,
      applicant_alliance: data.applicant_alliance || null,
      applicant_power: data.applicant_power || null,
      commander_name: data.commander_name,
      commander_level: data.commander_level || null,
      skill_levels: data.skill_levels || null,
      commander_stars: data.commander_stars || null,
      preferred_tier: data.preferred_tier || null,
      max_tier: data.max_tier || null,
      notes: data.notes || null,
      screenshot_url: data.screenshot_url || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('Failed to submit application:', error.message);
    return null;
  }
  return result;
}

export async function updateApplicationStatus(
  appId: number,
  status: MgeApplicationStatus,
  officerNotes?: string | null,
  assignedTier?: string | null,
  equipmentRating?: number | null
): Promise<boolean> {
  const updates: Record<string, unknown> = {
    status,
    officer_notes: officerNotes ?? null,
    assigned_tier: assignedTier ?? null,
    decided_at: new Date().toISOString(),
  };
  if (equipmentRating !== undefined) {
    updates.equipment_rating = equipmentRating;
  }
  const { error } = await supabase
    .from('mge_applications')
    .update(updates)
    .eq('id', appId);

  if (error) {
    console.error('Failed to update application:', error.message);
    return false;
  }
  return true;
}

export async function withdrawApplication(appId: number): Promise<boolean> {
  return updateApplicationStatus(appId, 'withdrawn');
}

/** Update applicant-editable fields (does NOT touch officer fields) */
export async function updateApplicationFields(
  appId: number,
  data: {
    commander_level?: number | null;
    skill_levels?: number[] | null;
    commander_stars?: number | null;
    preferred_tier?: string | null;
    max_tier?: string | null;
    notes?: string | null;
    screenshot_url?: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('mge_applications')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', appId);

  if (error) {
    console.error('Failed to update application:', error.message);
    return false;
  }
  return true;
}

/** Hard-delete an application (for user withdrawing a pending app) */
export async function deleteApplication(appId: number): Promise<boolean> {
  const { error } = await supabase
    .from('mge_applications')
    .delete()
    .eq('id', appId);

  if (error) {
    console.error('Failed to delete application:', error.message);
    return false;
  }
  return true;
}

/** Convert all approved applications into mge_selections and finalize the event */
export async function convertApprovedToSelections(eventId: number): Promise<boolean> {
  // Get approved applications
  const { data: apps } = await supabase
    .from('mge_applications')
    .select('*')
    .eq('mge_event_id', eventId)
    .eq('status', 'approved')
    .order('created_at');

  if (!apps || apps.length === 0) return true;

  // Clear existing selections for this event
  await supabase.from('mge_selections').delete().eq('mge_event_id', eventId);

  // Create selections from approved applications
  const selections = apps.map((app: MgeApplication, i: number) => ({
    mge_event_id: eventId,
    member_name: app.applicant_name,
    ranking_tier: app.assigned_tier || app.preferred_tier || `${i + 1}th Place`,
    power_cap: null as number | null,
    reason: null as string | null,
    sort_order: i,
  }));

  // Get tiers to fill in point caps
  const { data: tiers } = await supabase
    .from('mge_rank_tiers')
    .select('*')
    .eq('mge_event_id', eventId)
    .order('sort_order');

  if (tiers) {
    const tierMap = new Map(tiers.map((t: MgeRankTier) => [t.tier_label, t]));
    for (const sel of selections) {
      const tier = tierMap.get(sel.ranking_tier);
      if (tier) sel.power_cap = tier.point_cap;
    }
  }

  const { error } = await supabase.from('mge_selections').insert(selections);
  if (error) {
    console.error('Failed to convert applications to selections:', error.message);
    return false;
  }

  // Update event status
  await updateMgeEventStatus(eventId, 'finalized');
  return true;
}
