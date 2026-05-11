import { createClient } from '@/lib/supabase/client';

/** Power floor (in millions) for migration tracking. Anything below this we
 *  ignore — small accounts hop between KDs constantly and aren't relevant. */
export const MIG_POWER_FLOOR_M_DEFAULT = 35;

/** Migrations "From" scan is fixed to this date — the first day we have
 *  reliable cross-KD coverage for KvK3 tracking. */
export const MIG_FROM_DATE = '2026-04-29';

/**
 * Returns the set of player_ids that already appear in the Migrations tab
 * between `fromDate` and `toDate`. A player counts as "migrated" if:
 *   1. they appear in both scans with a different kingdom_id (real migration), OR
 *   2. they appear in `toDate` but were not in the From scan AND their current
 *      kingdom_id was already being scanned at `fromDate` (new joiner — they
 *      moved in from outside, or grew across the power floor).
 *
 * The KD-coverage check on rule (2) avoids false positives when the scan
 * coverage widens between the two dates: a player residing in a KD that
 * wasn't scanned at `fromDate` would otherwise look like a "new joiner" even
 * though they were probably there the whole time.
 *
 * `floorMillions` is applied to the To-scan power so the set matches what
 * the Migrations tab actually shows. Returns an empty set if either date is
 * missing or both are the same.
 *
 * `tablePlayers` defaults to seeds_kd_players for the regular KvK flow; pass
 * 'cross_season_kd_players' to compute cross-season migrations instead.
 * `fromDate` defaults to MIG_FROM_DATE so existing call sites stay green.
 */
export async function fetchMigratedPlayerIds(
  toDate: string | null,
  floorMillions: number = MIG_POWER_FLOOR_M_DEFAULT,
  opts: { tablePlayers?: string; fromDate?: string | null } = {},
): Promise<Set<number>> {
  const tablePlayers = opts.tablePlayers ?? 'seeds_kd_players';
  const fromDate = opts.fromDate ?? MIG_FROM_DATE;
  if (!toDate || !fromDate || toDate === fromDate) return new Set();
  const sb = createClient();
  const floor = floorMillions * 1_000_000;

  const pull = async (date: string, applyFloor: boolean) => {
    const all: { player_id: number; kingdom_id: number }[] = [];
    let from = 0;
    while (true) {
      let q = sb
        .from(tablePlayers)
        .select('player_id, kingdom_id')
        .eq('scan_date', date);
      if (applyFloor) q = q.gte('power', floor);
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) all.push(r as typeof all[number]);
      if (data.length < 1000) break;
      from += 1000;
    }
    return all;
  };

  const [fromRows, toRows] = await Promise.all([pull(fromDate, false), pull(toDate, true)]);
  const fromMap = new Map(fromRows.map((r) => [r.player_id, r.kingdom_id] as const));
  // Set of KDs that were already part of the scan coverage at fromDate.
  // A player in a KD outside this set can't be reliably classified as a "new
  // joiner" — we simply weren't watching their kingdom before.
  const fromDateKds = new Set(fromRows.map((r) => r.kingdom_id));

  const migrated = new Set<number>();
  for (const t of toRows) {
    const fKd = fromMap.get(t.player_id);
    if (fKd === undefined) {
      // Only flag as new joiner when their current KD was covered at fromDate.
      // Otherwise we have no evidence they moved — they may have been there
      // all along, just outside our scan window.
      if (fromDateKds.has(t.kingdom_id)) {
        migrated.add(t.player_id);
      }
    } else if (fKd !== t.kingdom_id) {
      migrated.add(t.player_id); // changed KD — confirmed migration
    }
  }
  return migrated;
}
