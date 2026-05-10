// Helpers for the Migration Outreach feature — players that an officer/admin
// has flagged as "let's try to recruit this person from another KD".
// Backed by migration_outreach (regular KvK) or cross_season_outreach (cross-
// season). All call sites that omit `table` keep the original behavior.

import { createClient } from './client';

const DEFAULT_TABLE = 'migration_outreach';

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
export async function addOutreachEntry(input: OutreachInput, table: string = DEFAULT_TABLE): Promise<{ added: boolean }> {
  const sb = createClient();
  const { data: existing, error: e1 } = await sb
    .from(table)
    .select('player_id')
    .eq('player_id', input.player_id)
    .maybeSingle();
  if (e1) throw e1;
  if (existing) return { added: false };

  const { error: e2 } = await sb.from(table).insert({
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

export async function listOutreach(table: string = DEFAULT_TABLE): Promise<OutreachEntry[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from(table)
    .select('*')
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutreachEntry[];
}

export async function listOutreachIds(table: string = DEFAULT_TABLE): Promise<Set<number>> {
  const sb = createClient();
  const ids = new Set<number>();
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from(table)
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
  table: string = DEFAULT_TABLE,
): Promise<void> {
  const sb = createClient();
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  // When contacted flips on, stamp contacted_at; when off, clear it.
  if (Object.prototype.hasOwnProperty.call(patch, 'contacted')) {
    update.contacted_at = patch.contacted ? new Date().toISOString() : null;
  }
  const { error } = await sb
    .from(table)
    .update(update)
    .eq('player_id', playerId);
  if (error) throw error;
}

export async function removeOutreach(playerId: number, table: string = DEFAULT_TABLE): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(table).delete().eq('player_id', playerId);
  if (error) throw error;
}

/** All outreach tables in the app — used by the auto-cleanup when a player is
 *  detected as migrated. Order doesn't matter; both are cleared. */
const ALL_OUTREACH_TABLES = ['migration_outreach', 'cross_season_outreach'] as const;

/** Bulk-remove the given player_ids from every outreach table. Used after the
 *  candidate page detects a player has migrated/changed KD between scans —
 *  they're no longer reachable for the original outreach so we drop them.
 *
 *  Reason ("migrated elsewhere") is intentionally not persisted: the outreach
 *  tables are working lists, not an audit log. The deletion is logged to the
 *  console for traceability instead. Returns counts per table. */
export async function removeFromAllOutreach(
  playerIds: number[],
): Promise<Record<string, number>> {
  if (playerIds.length === 0) return {};
  const sb = createClient();
  const result: Record<string, number> = {};
  for (const table of ALL_OUTREACH_TABLES) {
    // Find which of the requested ids actually exist in this table so the
    // returned count reflects real removals (not just "was asked to delete").
    const present = new Set<number>();
    const CHUNK = 500;
    for (let i = 0; i < playerIds.length; i += CHUNK) {
      const slice = playerIds.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from(table)
        .select('player_id')
        .in('player_id', slice);
      if (error) throw error;
      for (const r of data ?? []) present.add(r.player_id as number);
    }
    if (present.size === 0) {
      result[table] = 0;
      continue;
    }
    const ids = [...present];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error } = await sb.from(table).delete().in('player_id', slice);
      if (error) throw error;
    }
    result[table] = present.size;
    if (present.size > 0) {
      console.info(
        `[outreach] auto-removed ${present.size} player(s) from ${table} — reason: migrated elsewhere`,
        ids,
      );
    }
  }
  return result;
}
