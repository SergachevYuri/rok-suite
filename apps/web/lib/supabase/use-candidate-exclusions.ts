// Helpers for the manual candidate-exclusion list on the Possible Candidates
// page. Backed by public.candidate_exclusions — see the SQL migration in
// supabase/migrations/add-candidate-exclusions.sql.

import { createClient } from './client';
import type { Season } from '@/lib/kingdom/season-config';

export interface CandidateExclusion {
  player_id: number;
  source: Season;
  excluded_by: string | null;
  excluded_at: string;
  reason: string | null;
}

export interface ExclusionInput {
  player_id: number;
  source: Season;
  excluded_by?: string | null;
  reason?: string | null;
}

/** Insert an exclusion. Idempotent — duplicate inserts on (player_id, source)
 *  return `{ added: false }` without throwing on the PK constraint. */
export async function addExclusion(input: ExclusionInput): Promise<{ added: boolean }> {
  const sb = createClient();
  const { data: existing, error: e1 } = await sb
    .from('candidate_exclusions')
    .select('player_id')
    .eq('player_id', input.player_id)
    .eq('source', input.source)
    .maybeSingle();
  if (e1) throw e1;
  if (existing) return { added: false };

  const { error: e2 } = await sb.from('candidate_exclusions').insert({
    player_id: input.player_id,
    source: input.source,
    excluded_by: input.excluded_by ?? null,
    reason: input.reason ?? null,
  });
  if (e2) throw e2;
  return { added: true };
}

export async function removeExclusion(playerId: number, source: Season): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from('candidate_exclusions')
    .delete()
    .eq('player_id', playerId)
    .eq('source', source);
  if (error) throw error;
}

/** Bulk insert exclusions in one round-trip. Duplicates on (player_id, source)
 *  are ignored — re-running with the same ids is a no-op. Returns the count of
 *  rows the caller asked us to add (not necessarily newly-inserted, but caller
 *  rarely cares for UI purposes). */
export async function addExclusionsBulk(
  playerIds: number[],
  source: Season,
  excludedBy?: string | null,
): Promise<number> {
  if (playerIds.length === 0) return 0;
  const sb = createClient();
  const uniqueIds = Array.from(new Set(playerIds));
  const rows = uniqueIds.map((id) => ({
    player_id: id,
    source,
    excluded_by: excludedBy ?? null,
  }));
  // upsert with ignoreDuplicates so re-adding an already-excluded player is
  // a no-op rather than a PK violation.
  const { error } = await sb
    .from('candidate_exclusions')
    .upsert(rows, { onConflict: 'player_id,source', ignoreDuplicates: true });
  if (error) throw error;
  return uniqueIds.length;
}

/** All exclusion rows for a season — used to render the "view excluded" panel. */
export async function listExclusions(source: Season): Promise<CandidateExclusion[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('candidate_exclusions')
    .select('*')
    .eq('source', source)
    .order('excluded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CandidateExclusion[];
}

/** Lightweight id-only fetch used by the candidate filter pipeline. */
export async function listExclusionIds(source: Season): Promise<Set<number>> {
  const sb = createClient();
  const ids = new Set<number>();
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('candidate_exclusions')
      .select('player_id')
      .eq('source', source)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) ids.add(r.player_id as number);
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}
