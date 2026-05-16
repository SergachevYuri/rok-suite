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

/** First, previous, and latest snapshots per KD. `first` is the oldest row
 *  on record for the kingdom — used by the top "season summary" chip to show
 *  power/rank progression since we started tracking. `previous` and `latest`
 *  drive the per-row "since last upload" delta when no compare dates are set. */
export interface KdSnapshotSummary {
  kingdom_id: number;
  first: KdSnapshotRow;
  latest: KdSnapshotRow;
  /** Second-most-recent snapshot. Null when only one snapshot exists. */
  previous: KdSnapshotRow | null;
}

/** Pulls every snapshot, groups by kingdom_id, returns first/previous/latest
 *  per KD. One paginated round-trip; the dataset stays small (one row per
 *  upload × KD). */
export async function fetchKdSnapshotSummary(): Promise<Map<number, KdSnapshotSummary>> {
  const sb = createClient();
  const all: KdSnapshotRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('seeds_kd_snapshots')
      .select('*')
      .order('uploaded_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as KdSnapshotRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  const byKd = new Map<number, KdSnapshotRow[]>();
  for (const row of all) {
    const list = byKd.get(row.kingdom_id) ?? [];
    list.push(row);
    byKd.set(row.kingdom_id, list);
  }

  const result = new Map<number, KdSnapshotSummary>();
  for (const [kd, rows] of byKd) {
    if (rows.length === 0) continue;
    result.set(kd, {
      kingdom_id: kd,
      first: rows[0],
      latest: rows[rows.length - 1],
      previous: rows.length >= 2 ? rows[rows.length - 2] : null,
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
