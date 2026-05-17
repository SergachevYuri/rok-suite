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
