// ─── Types ──────────────────────────────────────────────────────────

export type RssNodeType = 'food' | 'wood' | 'stone' | 'gold';
export type RssNodeStatus = 'pending' | 'approved' | 'rejected';

export interface RssNode {
  id: number;
  type: RssNodeType;
  x: number;
  y: number;
  status: RssNodeStatus;
}

// ─── Colors ─────────────────────────────────────────────────────────

export const RSS_TYPE_COLORS: Record<RssNodeType, string> = {
  food: '#22c55e',
  wood: '#a16207',
  stone: '#6b7280',
  gold: '#eab308',
};

export const RSS_TYPE_LABELS: Record<RssNodeType, string> = {
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold',
};

export const RSS_TYPES: RssNodeType[] = ['food', 'wood', 'stone', 'gold'];

// ─── Data loader (lazy — JSON loaded only when called) ──────────────

export async function loadRssNodes(): Promise<RssNode[]> {
  const { default: rssNodesRaw } = await import('@/data/rss_nodes_all.json');
  return (rssNodesRaw as { type: string; x: number; y: number }[]).map((raw, i) => ({
    id: i,
    type: (RSS_TYPES.includes(raw.type as RssNodeType) ? raw.type : 'food') as RssNodeType,
    x: raw.x,
    y: raw.y,
    status: 'pending' as RssNodeStatus,
  }));
}
