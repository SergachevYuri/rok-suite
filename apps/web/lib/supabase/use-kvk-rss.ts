import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { RssNode } from '@/lib/kvk-map/rss-review';
import { loadRssNodes } from '@/lib/kvk-map/rss-review';

// ─── Types ──────────────────────────────────────────────────────────

export interface RssFlag {
  id: string;
  map_id: string;
  node_x: number;
  node_y: number;
  node_type: string | null;
  reason: string | null;
  created_at: string;
}

// ─── RSS Nodes Hook ─────────────────────────────────────────────────

export function useKvkRssNodes(mapId: string | undefined) {
  const [rssNodes, setRssNodes] = useState<RssNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    if (!mapId) {
      setRssNodes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Try Supabase first
      const { data, error: err } = await supabase
        .from('kvk_rss_nodes')
        .select('nodes')
        .eq('map_id', mapId)
        .single();

      if (!err && data?.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
        const nodes = (data.nodes as { type: string; x: number; y: number }[]).map((raw, i) => ({
          id: i,
          type: raw.type as RssNode['type'],
          x: raw.x,
          y: raw.y,
          status: 'approved' as const,
          source: 'manual' as const,
          segment: 0,
        }));
        setRssNodes(nodes);
      } else {
        // Fallback to bundled JSON
        const nodes = await loadRssNodes();
        setRssNodes(nodes);
      }
    } catch {
      // Supabase table might not exist yet — fallback to JSON
      try {
        const nodes = await loadRssNodes();
        setRssNodes(nodes);
      } catch (jsonErr) {
        setError(jsonErr instanceof Error ? jsonErr.message : 'Failed to load RSS nodes');
      }
    }

    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  return { rssNodes, setRssNodes, loading, error, refetch: fetchNodes };
}

// ─── Save RSS Nodes (admin) ─────────────────────────────────────────

export async function saveRssNodes(
  mapId: string,
  nodes: RssNode[],
): Promise<boolean> {
  const payload = nodes.map(n => ({ x: n.x, y: n.y, type: n.type }));

  // Upsert: insert if not exists, update if exists
  const { error } = await supabase
    .from('kvk_rss_nodes')
    .upsert(
      { map_id: mapId, nodes: payload, updated_at: new Date().toISOString() },
      { onConflict: 'map_id' },
    );

  if (error) {
    console.error('Failed to save RSS nodes:', error.message);
    return false;
  }
  return true;
}

// ─── RSS Flags Hook ─────────────────────────────────────────────────

export function useKvkRssFlags(mapId: string | undefined) {
  const [flags, setFlags] = useState<RssFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    if (!mapId) {
      setFlags([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('kvk_rss_flags')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setFlags(data as RssFlag[]);
    }
    setLoading(false);
  }, [mapId]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  return { flags, loading, refetch: fetchFlags };
}

// ─── Flag a Node (officer) ──────────────────────────────────────────

export async function flagRssNode(
  mapId: string,
  nodeX: number,
  nodeY: number,
  nodeType: string,
  reason?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_rss_flags')
    .insert({
      map_id: mapId,
      node_x: nodeX,
      node_y: nodeY,
      node_type: nodeType,
      reason: reason || null,
    });

  if (error) {
    console.error('Failed to flag RSS node:', error.message);
    return false;
  }
  return true;
}

// ─── Remove a flag (admin) ──────────────────────────────────────────

export async function removeFlagRssNode(flagId: string): Promise<boolean> {
  const { error } = await supabase
    .from('kvk_rss_flags')
    .delete()
    .eq('id', flagId);

  if (error) {
    console.error('Failed to remove flag:', error.message);
    return false;
  }
  return true;
}
