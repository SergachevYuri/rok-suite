// Client wrapper around our /api/heroscroll/kingdoms proxy. Returns the raw
// rows for further client-side filtering / sorting. The shape matches the
// upstream response.

export interface HeroscrollKingdom {
  rollup_type: string;
  timestamp: string;
  last_updated: number;
  kingdom_id: number;
  total_power: number;
  total_killpoints: number;
  total_deads: number;
  total_troop_power: number;
  player_count: number;
  ch25_count: number;
  domain_count: number;
  inactive_player_count: number;
  total_rss_given: number;
  total_rss_gathered: number;
  lost_kingdom_most_killed_average: number | null;
  lost_kingdom_most_lost_average: number | null;
  total_acclaim: number;
  rank: number;
  power: number;
  killpoints: number;
  deads: number;
  troop_power: number;
}

/** POSTs to the proxy with the chosen rollup type. Default `top400` matches
 *  Heroscroll's main board view. */
export async function fetchHeroscrollKingdoms(rollupType: 'top400' = 'top400'): Promise<HeroscrollKingdom[]> {
  const res = await fetch('/api/heroscroll/kingdoms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rollupType }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Heroscroll proxy failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  const rows = extractKingdomArray(data);
  if (rows.length === 0) {
    // Log the actual shape so we can adjust the extractor if needed.
    console.warn('[heroscroll] no kingdoms in response — raw shape:', data);
  }
  return rows;
}

/** Persist a Heroscroll fetch to `heroscroll_snapshots`, one row per KD in
 *  the supplied filter. Idempotent per (scan_date, kingdom_id) via upsert —
 *  re-running the same day replaces today's row.
 *
 *  Returns the count of rows actually written so the UI can show a toast. */
export async function saveHeroscrollSnapshot(
  rows: HeroscrollKingdom[],
  kdFilter: (kd: number) => boolean,
): Promise<{ saved: number; scanDate: string }> {
  const { createClient } = await import('@/lib/supabase/client');
  const sb = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const payload = rows
    .filter((r): r is HeroscrollKingdom => r != null && kdFilter(r.kingdom_id))
    .map((r) => ({
      scan_date: today,
      kingdom_id: r.kingdom_id,
      total_power: r.total_power,
      total_killpoints: r.total_killpoints,
      total_deads: r.total_deads,
      total_troop_power: r.total_troop_power,
      player_count: r.player_count,
      ch25_count: r.ch25_count,
      inactive_player_count: r.inactive_player_count,
      total_rss_given: r.total_rss_given,
      total_rss_gathered: r.total_rss_gathered,
      total_acclaim: r.total_acclaim,
      rank: r.rank,
      heroscroll_last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
    }));
  if (payload.length === 0) return { saved: 0, scanDate: today };
  const { error } = await sb
    .from('heroscroll_snapshots')
    .upsert(payload, { onConflict: 'scan_date,kingdom_id' });
  if (error) throw error;
  return { saved: payload.length, scanDate: today };
}

/** Most-recent capture timestamp across the heroscroll_snapshots table. Used
 *  to render the "Last snapshot saved: X ago" hint in the panel. */
export async function fetchLatestHeroscrollSnapshotMeta(): Promise<{ captured_at: string; scan_date: string } | null> {
  const { createClient } = await import('@/lib/supabase/client');
  const sb = createClient();
  const { data, error } = await sb
    .from('heroscroll_snapshots')
    .select('captured_at, scan_date')
    .order('captured_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { captured_at: string; scan_date: string } | undefined) ?? null;
}

/** Recursively scan the JSON until we find an array whose first non-null
 *  element has a `kingdom_id` field. Handles whatever wrapper Heroscroll
 *  decides to return without us guessing the key name. */
function extractKingdomArray(data: unknown): HeroscrollKingdom[] {
  const looksLikeRow = (x: unknown): x is HeroscrollKingdom =>
    typeof x === 'object' && x !== null && 'kingdom_id' in (x as Record<string, unknown>);

  const visit = (node: unknown): HeroscrollKingdom[] | null => {
    if (Array.isArray(node)) {
      const sample = node.find((it) => it != null);
      if (looksLikeRow(sample)) return node.filter((it): it is HeroscrollKingdom => looksLikeRow(it));
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) {
        const found = visit(v);
        if (found) return found;
      }
    }
    return null;
  };

  return visit(data) ?? [];
}
