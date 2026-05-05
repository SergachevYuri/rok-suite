import { createClient } from './client';
import type { AooRegistration } from '@/lib/aoo-strategy/types';

/** A frozen snapshot of the league roster for the duration of a tournament.
 *  While a tournament is active, the team builder reads its league roster
 *  from this snapshot instead of the live sheet tab so mid-tournament edits
 *  to the sheet can't silently change who's committed to play. */
export interface AooLeagueTournament {
  id: string;
  name: string;
  /** Frozen AooRegistration rows captured at start time. */
  roster: AooRegistration[];
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
  ended_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Returns the currently active tournament (ended_at IS NULL), if any.
 *  At most one is enforced by a partial unique index on the table. */
export async function getActiveLeagueTournament(): Promise<AooLeagueTournament | null> {
  const { data, error } = await createClient()
    .from('aoo_league_tournaments')
    .select('*')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AooLeagueTournament | null) ?? null;
}

/** Snapshot the current league roster and start a tournament. The active row
 *  becomes the source of truth for the league team until ended. */
export async function startLeagueTournament(
  name: string,
  roster: AooRegistration[],
  startedBy: string | null,
): Promise<AooLeagueTournament> {
  const { data, error } = await createClient()
    .from('aoo_league_tournaments')
    .insert({
      name,
      roster,
      started_by: startedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AooLeagueTournament;
}

/** End a tournament — clears the active flag so the planner falls back to
 *  the live league sheet tab. The historical row is retained for audit. */
export async function endLeagueTournament(
  id: string,
  endedBy: string | null,
): Promise<void> {
  const { error } = await createClient()
    .from('aoo_league_tournaments')
    .update({
      ended_at: new Date().toISOString(),
      ended_by: endedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}
