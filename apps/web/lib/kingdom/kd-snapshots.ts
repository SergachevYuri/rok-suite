// Helpers for the per-upload KD snapshot audit (seeds_kd_snapshots).
//
// Each scan upload appends one row per KD into this table so the Comparison
// view can render a "since last upload" delta on each row. The schema is
// intentionally minimal — just the aggregate numbers we need to draw arrows.

import { createClient } from '@/lib/supabase/client';

export interface KdSnapshotInput {
  kingdom_id: number;
  power_400: number;
  total_kp: number;
  power_rank: number;
  kp_rank: number;
}

export interface KdSnapshotRow {
  snapshot_id: number;
  uploaded_at: string;
  scan_date: string;
  kingdom_id: number;
  power_400: number | null;
  total_kp: number | null;
  power_rank: number | null;
  kp_rank: number | null;
}

/** Bulk-insert one snapshot row per KD for a single upload event. All rows
 *  share the same scan_date but each gets its own auto-bumped snapshot_id and
 *  a server-default uploaded_at, so multiple uploads on the same day stay
 *  distinguishable. */
export async function insertKdSnapshots(
  scanDate: string,
  rows: KdSnapshotInput[],
): Promise<void> {
  if (rows.length === 0) return;
  const sb = createClient();
  const payload = rows.map((r) => ({
    scan_date: scanDate,
    kingdom_id: r.kingdom_id,
    power_400: r.power_400,
    total_kp: r.total_kp,
    power_rank: r.power_rank,
    kp_rank: r.kp_rank,
  }));
  const { error } = await sb.from('seeds_kd_snapshots').insert(payload);
  if (error) throw error;
}

export interface KdSnapshotDelta {
  kingdom_id: number;
  latest: KdSnapshotRow;
  previous: KdSnapshotRow | null;
  /** latest.power_400 - previous.power_400; null when no previous snapshot. */
  deltaPower: number | null;
  /** latest.total_kp - previous.total_kp; null when no previous snapshot. */
  deltaKp: number | null;
}

/** Returns the two most-recent snapshots per kingdom_id and the implied
 *  deltas. One round-trip to Supabase: pulls a generous window of recent rows
 *  and groups in memory by kingdom_id since PostgREST has no per-group LIMIT. */
export async function fetchLatestSnapshotsDelta(): Promise<Map<number, KdSnapshotDelta>> {
  const sb = createClient();
  // 1000 rows is plenty for "last 2 per KD across ~64 KDs" (= up to 128 rows
  // ideal). We pull more so the most recent N uploads are guaranteed covered.
  const { data, error } = await sb
    .from('seeds_kd_snapshots')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const byKd = new Map<number, KdSnapshotRow[]>();
  for (const row of (data ?? []) as KdSnapshotRow[]) {
    const list = byKd.get(row.kingdom_id) ?? [];
    if (list.length < 2) list.push(row); // already sorted DESC, take first two
    byKd.set(row.kingdom_id, list);
  }

  const result = new Map<number, KdSnapshotDelta>();
  for (const [kd, rows] of byKd) {
    const latest = rows[0];
    const previous = rows[1] ?? null;
    result.set(kd, {
      kingdom_id: kd,
      latest,
      previous,
      deltaPower: previous && latest.power_400 != null && previous.power_400 != null
        ? latest.power_400 - previous.power_400
        : null,
      deltaKp: previous && latest.total_kp != null && previous.total_kp != null
        ? latest.total_kp - previous.total_kp
        : null,
    });
  }
  return result;
}

/** Compact "X time ago" string for an ISO timestamp. Mirrors what the user
 *  asked for in the spec ("4 hours ago"). Falls back to short date for things
 *  older than a week. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = Math.max(0, now.getTime() - then.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m}m ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return `${h}h ago`;
  }
  if (diff < 7 * day) {
    const d = Math.floor(diff / day);
    return `${d}d ago`;
  }
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
