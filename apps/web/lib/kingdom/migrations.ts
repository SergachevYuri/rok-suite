import { createClient } from '@/lib/supabase/client';

/** Power floor (in millions) for migration tracking. Anything below this we
 *  ignore — small accounts hop between KDs constantly and aren't relevant. */
export const MIG_POWER_FLOOR_M_DEFAULT = 35;

/** Migrations "From" scan is fixed to this date — the first day we have
 *  reliable cross-KD coverage for KvK3 tracking. */
export const MIG_FROM_DATE = '2026-04-29';

/**
 * Returns the set of player_ids that have either moved KD or are new arrivals
 * relative to each KD's first appearance in our scan history.
 *
 * Detection rule — per-KD baseline:
 *   For each player currently in KD X (in `toDate`'s scan, ≥ floor), look at
 *   the first scan_date we have for X. If the player wasn't already in X
 *   at that first scan, flag them as migrated.
 *
 * Why per-KD instead of a single global `fromDate`?
 *   Scan coverage widens over time — the preview pool (3929-3944) was added
 *   to the scan rotation only after MIG_FROM_DATE. A player who arrived in
 *   3938 after we started scanning it should still be flagged as "moved",
 *   even though we have no record of them at MIG_FROM_DATE. Treating each
 *   KD's first scan as that KD's seed-day handles this uniformly: current
 *   pool KDs have first_scan = MIG_FROM_DATE (unchanged behavior), preview
 *   pool KDs use whatever date we first started tracking them.
 *
 * `floorMillions` is applied only to the To-scan power. The first-scan
 * lookup is unfiltered so a player who was <floor at the baseline but is now
 * ≥floor in the same KD is still recognized as a resident, not a migrant.
 *
 * `tablePlayers` defaults to seeds_kd_players; pass 'cross_season_kd_players'
 * for the cross-season pool. `fromDate` is accepted for backward compat but
 * ignored — the per-KD first scan is the canonical baseline now.
 */
export async function fetchMigratedPlayerIds(
  toDate: string | null,
  floorMillions: number = MIG_POWER_FLOOR_M_DEFAULT,
  opts: { tablePlayers?: string; fromDate?: string | null } = {},
): Promise<Set<number>> {
  const tablePlayers = opts.tablePlayers ?? 'seeds_kd_players';
  if (!toDate) return new Set();
  const sb = createClient();
  const floor = floorMillions * 1_000_000;

  // 1. Pull every player in the latest scan at-or-above the power floor.
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

  const toRows = await pull(toDate, true);
  if (toRows.length === 0) return new Set();

  // 2. For every KD that appears in toRows, find the earliest scan_date we
  //    have for it. Pulled from the lighter stats table when possible (1 row
  //    per scan_date+kingdom_id) since the players table can be huge.
  const toKds = [...new Set(toRows.map((r) => r.kingdom_id))];
  const tableStats = tablePlayers.endsWith('_players')
    ? tablePlayers.replace(/_players$/, '_stats')
    : null;

  const firstSeen = new Map<number, string>(); // kingdom_id -> earliest scan_date
  if (tableStats) {
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from(tableStats)
        .select('kingdom_id, scan_date')
        .in('kingdom_id', toKds)
        .order('scan_date', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) {
        const kd = r.kingdom_id as number;
        if (!firstSeen.has(kd)) firstSeen.set(kd, r.scan_date as string);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  } else {
    // Fallback: probe the players table per KD (slower but always works).
    await Promise.all(toKds.map(async (kd) => {
      const { data } = await sb
        .from(tablePlayers)
        .select('scan_date')
        .eq('kingdom_id', kd)
        .order('scan_date', { ascending: true })
        .limit(1);
      if (data?.[0]) firstSeen.set(kd, data[0].scan_date as string);
    }));
  }

  // 3. For each (kingdom_id, first_seen) pair pull the player_ids that were
  //    in that KD at that first scan. Parallel so it's roughly one round-trip
  //    worth of latency.
  const firstResidents = new Map<number, Set<number>>();
  await Promise.all([...firstSeen.entries()].map(async ([kd, date]) => {
    const residents = new Set<number>();
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from(tablePlayers)
        .select('player_id')
        .eq('kingdom_id', kd)
        .eq('scan_date', date)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) residents.add(r.player_id as number);
      if (data.length < 1000) break;
      from += 1000;
    }
    firstResidents.set(kd, residents);
  }));

  // 4. Flag any player whose current (player_id, toKd) wasn't in the first
  //    scan we have for that KD — either they joined in later, or they moved
  //    in from a different KD.
  const migrated = new Set<number>();
  for (const t of toRows) {
    // No first-scan data → can't classify; default to not-migrated so we
    // don't accidentally hide legit candidates because of a data hiccup.
    const residents = firstResidents.get(t.kingdom_id);
    if (!residents) continue;
    // Player WAS at this KD at first scan → not migrated, even if they were
    // below the power floor back then.
    if (residents.has(t.player_id)) continue;
    // Same scan_date as first scan → no prior history exists, can't claim
    // migration (and we wouldn't want to flag the entire first scan).
    if (firstSeen.get(t.kingdom_id) === toDate) continue;
    migrated.add(t.player_id);
  }
  return migrated;
}
