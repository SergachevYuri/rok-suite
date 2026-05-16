// Post-scan cleanup — when a new K23 scan is uploaded, anyone who was in the
// previous scan but is missing from the new one is treated as "migrated away".
// We propagate that state to every list where the player can still appear:
//   - migration_cases (active states only) → state='migrated'
//   - migration_outreach            → delete
//   - cross_season_outreach         → delete
//
// The caller (SeedsUpload) shows the counts to confirm what changed.

import { createClient } from '@/lib/supabase/client';
import { KINGDOM_ID } from '@/lib/zero-list/scan-data';

/** Migration_cases.state values that are considered "terminal" — we leave
 *  those rows alone so an admin's manual decision (excepted/zeroed/afk) isn't
 *  overwritten by the auto-cleanup. 'migrated' is also terminal so re-running
 *  is a no-op. */
const TERMINAL_STATES = new Set(['migrated', 'excepted', 'zeroed', 'afk']);

export interface DepartureCleanupResult {
  /** scan_date used as the "previous" baseline. Null = no prior scan, nothing done. */
  previousScanDate: string | null;
  /** Total players present at previousScanDate but missing at latestScanDate. */
  departedCount: number;
  /** Active migration_cases rows we flipped to state='migrated'. */
  casesMigrated: number;
  /** Rows removed from migration_outreach. */
  outreachRemoved: number;
  /** Rows removed from cross_season_outreach. */
  crossOutreachRemoved: number;
}

/** Compare the latest K23 scan to the previous one and mark the disappeared
 *  players as migrated. Idempotent — re-running with the same `latestScanDate`
 *  does nothing extra because already-migrated cases are excluded by the
 *  TERMINAL_STATES guard and the outreach deletes have no rows left to hit. */
export async function cleanupDepartedKingdomPlayers(
  latestScanDate: string,
  kingdomId: number = KINGDOM_ID,
): Promise<DepartureCleanupResult> {
  const sb = createClient();
  const empty: DepartureCleanupResult = {
    previousScanDate: null,
    departedCount: 0,
    casesMigrated: 0,
    outreachRemoved: 0,
    crossOutreachRemoved: 0,
  };

  // 1. Most-recent scan_date for this kingdom that's strictly before the one
  //    we just uploaded. If we don't have a prior scan, we have nothing to
  //    compare against.
  const { data: prevRow, error: e1 } = await sb
    .from('seeds_kd_stats')
    .select('scan_date')
    .eq('kingdom_id', kingdomId)
    .lt('scan_date', latestScanDate)
    .order('scan_date', { ascending: false })
    .limit(1);
  if (e1) throw e1;
  const previousScanDate = (prevRow?.[0]?.scan_date as string | undefined) ?? null;
  if (!previousScanDate) return empty;

  // 2. Pull the player_id sets at both dates (no power floor — the K23 scan
  //    captures the relevant population).
  const pullIds = async (date: string): Promise<Set<number>> => {
    const ids = new Set<number>();
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('seeds_kd_players')
        .select('player_id')
        .eq('kingdom_id', kingdomId)
        .eq('scan_date', date)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) ids.add(r.player_id as number);
      if (data.length < 1000) break;
      from += 1000;
    }
    return ids;
  };

  const [latestIds, previousIds] = await Promise.all([
    pullIds(latestScanDate),
    pullIds(previousScanDate),
  ]);

  // 3. Departed = in previous, not in latest.
  const departed: number[] = [];
  for (const id of previousIds) {
    if (!latestIds.has(id)) departed.push(id);
  }
  if (departed.length === 0) {
    return { ...empty, previousScanDate };
  }

  const CHUNK = 500;
  const nowIso = new Date().toISOString();

  // 4. Flip migration_cases to 'migrated' for non-terminal rows. We rely on
  //    a returning select to count how many actually changed (the IN filter
  //    + state CHECK constraint means an already-terminal row is skipped).
  let casesMigrated = 0;
  for (let i = 0; i < departed.length; i += CHUNK) {
    const slice = departed.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from('migration_cases')
      .update({
        state: 'migrated',
        migrated_confirmed_at: nowIso,
        migrated_confirmed_by: 'auto:scan',
      })
      .in('character_id', slice)
      .not('state', 'in', `(${[...TERMINAL_STATES].join(',')})`)
      .select('id');
    if (error) throw error;
    casesMigrated += data?.length ?? 0;
  }

  // 5. Drop them from both outreach tables — they're unreachable now.
  const deleteFromOutreach = async (table: 'migration_outreach' | 'cross_season_outreach'): Promise<number> => {
    let removed = 0;
    for (let i = 0; i < departed.length; i += CHUNK) {
      const slice = departed.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from(table)
        .delete()
        .in('player_id', slice)
        .select('player_id');
      if (error) throw error;
      removed += data?.length ?? 0;
    }
    return removed;
  };

  const [outreachRemoved, crossOutreachRemoved] = await Promise.all([
    deleteFromOutreach('migration_outreach'),
    deleteFromOutreach('cross_season_outreach'),
  ]);

  return {
    previousScanDate,
    departedCount: departed.length,
    casesMigrated,
    outreachRemoved,
    crossOutreachRemoved,
  };
}
