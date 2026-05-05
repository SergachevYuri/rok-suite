// Helpers for the Migration Outreach feature — players that an officer/admin
// has flagged as "let's try to recruit this person from another KD".
// Backed by the migration_outreach table.

import { createClient } from './client';

export interface OutreachEntry {
  player_id: number;
  kingdom_id: number;
  name: string | null;
  power: number;
  kp: number;
  cityhall: number;
  rank_in_kd: number | null;
  source_scan_date: string | null;
  added_at: string;
  added_by: string | null;
  contacted: boolean;
  contacted_at: string | null;
  contacted_by: string | null;
  response: string | null;
  notes: string | null;
  updated_at: string;
}

export interface OutreachInput {
  player_id: number;
  kingdom_id: number;
  name: string | null;
  power: number;
  kp: number;
  cityhall?: number;
  rank_in_kd?: number | null;
  source_scan_date?: string | null;
  added_by?: string | null;
}

/** Insert one player into the outreach table. Idempotent — if the player
 *  is already there, returns `{ added: false }` without overwriting any
 *  contact tracking the leadership has already filled in. */
export async function addOutreachEntry(input: OutreachInput): Promise<{ added: boolean }> {
  const sb = createClient();
  const { data: existing, error: e1 } = await sb
    .from('migration_outreach')
    .select('player_id')
    .eq('player_id', input.player_id)
    .maybeSingle();
  if (e1) throw e1;
  if (existing) return { added: false };

  const { error: e2 } = await sb.from('migration_outreach').insert({
    player_id: input.player_id,
    kingdom_id: input.kingdom_id,
    name: input.name,
    power: input.power,
    kp: input.kp,
    cityhall: input.cityhall ?? 0,
    rank_in_kd: input.rank_in_kd ?? null,
    source_scan_date: input.source_scan_date ?? null,
    added_by: input.added_by ?? null,
  });
  if (e2) throw e2;
  return { added: true };
}

export async function listOutreach(): Promise<OutreachEntry[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('migration_outreach')
    .select('*')
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutreachEntry[];
}

export async function listOutreachIds(): Promise<Set<number>> {
  const sb = createClient();
  const ids = new Set<number>();
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('migration_outreach')
      .select('player_id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) ids.add(r.player_id as number);
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}

export async function updateOutreach(
  playerId: number,
  patch: Partial<Pick<OutreachEntry, 'contacted' | 'contacted_by' | 'response' | 'notes'>>,
): Promise<void> {
  const sb = createClient();
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  // When contacted flips on, stamp contacted_at; when off, clear it.
  if (Object.prototype.hasOwnProperty.call(patch, 'contacted')) {
    update.contacted_at = patch.contacted ? new Date().toISOString() : null;
  }
  const { error } = await sb
    .from('migration_outreach')
    .update(update)
    .eq('player_id', playerId);
  if (error) throw error;
}

export async function removeOutreach(playerId: number): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('migration_outreach').delete().eq('player_id', playerId);
  if (error) throw error;
}
