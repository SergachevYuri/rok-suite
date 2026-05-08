// Helpers for the migration_clearances table — manual "not illegal" overrides
// applied to new arrivals on the Global candidates view.

import { createClient } from './client';

export interface ClearanceEntry {
  player_id: number;
  cleared_by: string | null;
  cleared_at: string;
  note: string | null;
}

export async function listClearanceIds(): Promise<Set<number>> {
  const sb = createClient();
  const ids = new Set<number>();
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('migration_clearances')
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

export async function addClearance(playerId: number, by: string | null, note?: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from('migration_clearances')
    .upsert({ player_id: playerId, cleared_by: by, note: note ?? null }, { onConflict: 'player_id' });
  if (error) throw error;
}

export async function removeClearance(playerId: number): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('migration_clearances').delete().eq('player_id', playerId);
  if (error) throw error;
}
