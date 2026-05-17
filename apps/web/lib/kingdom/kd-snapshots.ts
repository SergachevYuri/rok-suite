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

/** "X time ago" rounded to the nearest 30 minutes, composed as `Xd Yh Zm ago`.
 *  Switches to a short date once the rounded delta hits 7+ days. Examples:
 *    1m elapsed       → "just now"
 *    20m elapsed      → "30m ago"
 *    47m elapsed      → "1h ago"      (rounds to 60m)
 *    1h 25m elapsed   → "1h 30m ago"  (rounds to 90m)
 *    5h 17m elapsed   → "5h 30m ago"
 *    1d 5h 12m        → "1d 5h ago"
 *    2d 17h 50m       → "2d 18h ago"
 *    8d               → "May 8" (locale short date) */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const minute = 60_000;
  const halfHour = 30 * minute;
  const hour = 60 * minute;
  const day = 24 * hour;

  const rounded = Math.round(diffMs / halfHour) * halfHour;
  if (rounded < halfHour) return 'just now';
  if (rounded >= 7 * day) {
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const days = Math.floor(rounded / day);
  const hoursLeft = Math.floor((rounded % day) / hour);
  const minutesLeft = Math.floor((rounded % hour) / minute);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hoursLeft > 0) parts.push(`${hoursLeft}h`);
  if (minutesLeft > 0) parts.push(`${minutesLeft}m`);
  return `${parts.join(' ')} ago`;
}
