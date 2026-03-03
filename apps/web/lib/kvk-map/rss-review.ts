// ─── Types ──────────────────────────────────────────────────────────

export type RssNodeType = 'food' | 'wood' | 'stone' | 'gold' | 'crystal';
export type RssNodeStatus = 'pending' | 'approved' | 'rejected';
export type RssNodeSource = 'manual' | 'propagated' | 'detected';
export type RssAnnotationMode = 'off' | 'annotate' | 'review';

export interface RssNode {
  id: number;
  type: RssNodeType;
  x: number;
  y: number;
  status: RssNodeStatus;
  source: RssNodeSource;
  segment: number;
  sourceNodeId?: number;
}

// ─── Colors ─────────────────────────────────────────────────────────

export const RSS_TYPE_COLORS: Record<RssNodeType, string> = {
  food: '#22c55e',
  wood: '#a16207',
  stone: '#6b7280',
  gold: '#eab308',
  crystal: '#3b82f6',
};

export const RSS_TYPE_LABELS: Record<RssNodeType, string> = {
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold',
  crystal: 'Crystal',
};

export const RSS_TYPES: RssNodeType[] = ['food', 'wood', 'stone', 'gold', 'crystal'];

// ─── Data loader (lazy — JSON loaded only when called) ──────────────

const RSS_STATUSES: RssNodeStatus[] = ['pending', 'approved', 'rejected'];
const RSS_SOURCES: RssNodeSource[] = ['manual', 'propagated', 'detected'];

export async function loadRssNodes(): Promise<RssNode[]> {
  const { default: rssNodesRaw } = await import('@/data/rss_nodes_complete.json');
  return (rssNodesRaw as { type: string; x: number; y: number; status?: string; source?: string }[]).map((raw, i) => ({
    id: i,
    type: (RSS_TYPES.includes(raw.type as RssNodeType) ? raw.type : 'food') as RssNodeType,
    x: raw.x,
    y: raw.y,
    status: (RSS_STATUSES.includes(raw.status as RssNodeStatus) ? raw.status : 'pending') as RssNodeStatus,
    source: (RSS_SOURCES.includes(raw.source as RssNodeSource) ? raw.source : 'detected') as RssNodeSource,
    segment: 0,
  }));
}
