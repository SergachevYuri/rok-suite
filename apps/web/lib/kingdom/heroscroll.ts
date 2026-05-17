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
  // Upstream sometimes wraps the array in { data: [...] } — handle both.
  if (Array.isArray(data)) return data as HeroscrollKingdom[];
  if (Array.isArray(data?.data)) return data.data as HeroscrollKingdom[];
  if (Array.isArray(data?.kingdoms)) return data.kingdoms as HeroscrollKingdom[];
  return [];
}
