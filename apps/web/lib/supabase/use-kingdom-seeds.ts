import { useState, useEffect } from 'react';
import { createClient, fetchAllRows } from './client';

export interface SeedKdStat {
  scan_date: string;
  kingdom_id: number;
  power_400: number;
  total_kp: number;
  power_rank: number;
  kp_rank: number;
  uploaded_at?: string;
}

export interface SeedPlayer {
  scan_date: string;
  kingdom_id: number;
  player_id: number;
  name: string;
  power: number;
  kp: number;
  cityhall: number;
  rank_in_kd: number;
}

/**
 * Pulls every distinct kingdom_id present in the seeds_kd_stats table.
 * Optional `filter` keeps only the KDs that match (e.g. a pool range — see
 * lib/kingdom/kd-pools.ts). Pass a stable function reference (or omit it).
 */
export function useAvailableSeedKingdoms(filter?: (kd: number) => boolean) {
  const [kingdoms, setKingdoms] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const ids = new Set<number>();
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('seeds_kd_stats')
          .select('kingdom_id')
          .range(offset, offset + 999);
        if (error) { console.error('Error fetching seed kingdoms:', error); break; }
        if (!data || data.length === 0) break;
        for (const r of data) ids.add(r.kingdom_id);
        if (data.length < 1000) break;
        offset += 1000;
      }
      const list = [...ids].sort((a, b) => a - b);
      setKingdoms(filter ? list.filter(filter) : list);
      setLoading(false);
    })();
  // Filter is identity-stable when callers use the helpers in kd-pools.ts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { kingdoms, loading };
}

export function useSeedDates(kingdomId: number | null = null) {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase.from('seeds_kd_stats').select('scan_date');
      if (kingdomId) query = query.eq('kingdom_id', kingdomId);

      const { data, error } = await query.order('scan_date', { ascending: false }).limit(5000);
      if (error) console.error('Error fetching seed dates:', error);

      const unique = data ? [...new Set(data.map((r: { scan_date: string }) => r.scan_date))] : [];
      setDates(unique);
      setLoading(false);
    })();
  }, [kingdomId]);

  return { dates, loading };
}

export function useSeedPlayers(kingdomId: number | null, date: string | null) {
  const [players, setPlayers] = useState<SeedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!kingdomId || !date) {
        if (!cancelled) { setPlayers([]); setLoading(false); }
        return;
      }
      setLoading(true);
      try {
        const supabase = createClient();
        const data = await fetchAllRows<SeedPlayer>((range) =>
          supabase
            .from('seeds_kd_players')
            .select('*')
            .eq('kingdom_id', kingdomId)
            .eq('scan_date', date)
            .order('rank_in_kd', { ascending: true })
            .range(range.from, range.to)
        );
        if (!cancelled) setPlayers(data);
      } catch (err) {
        console.error('Error fetching seed players:', err);
        if (!cancelled) setPlayers([]);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [kingdomId, date, refreshTick]);

  return { players, loading, refetch: () => setRefreshTick(t => t + 1) };
}

/**
 * Fetch KD aggregate stats for a list of kingdoms in an optional date range.
 * Used by the Charts tab (multi-line chart) and Comparison tab (single-date ranking).
 */
export function useSeedKdStats(
  kingdomIds: number[],
  dateFrom: string | null = null,
  dateTo: string | null = null,
) {
  const [stats, setStats] = useState<SeedKdStat[]>([]);
  const [loading, setLoading] = useState(true);

  const key = kingdomIds.join(',') + '|' + (dateFrom || '') + '|' + (dateTo || '');

  useEffect(() => {
    if (kingdomIds.length === 0) { setStats([]); setLoading(false); return; }

    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        let query = supabase
          .from('seeds_kd_stats')
          .select('*')
          .in('kingdom_id', kingdomIds);

        if (dateFrom) query = query.gte('scan_date', dateFrom);
        if (dateTo)   query = query.lte('scan_date', dateTo);

        const data = await fetchAllRows<SeedKdStat>((range) =>
          query.order('scan_date', { ascending: true }).range(range.from, range.to)
        );
        setStats(data);
      } catch (err) {
        console.error('Error fetching seed kd stats:', err);
        setStats([]);
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { stats, loading };
}

export function formatCompact(n: number): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}
