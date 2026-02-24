import { useState, useEffect, useCallback } from 'react';
import { createClient, fetchAllRows } from './client';

export interface KingdomMember {
  id: number;
  kingdom_id: number;
  dt: string;
  name: string;
  power: number;
  max_power: number;
  collect: number;
  dead: number;
  kill: number;
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  t5: number;
  help: number;
  dead_t1: number;
  dead_t2: number;
  dead_t3: number;
  dead_t4: number;
  dead_t5: number;
}

export interface KingdomAggregate {
  dt: string;
  kingdom_id: number;
  total_power: number;
  total_kill: number;
  total_collect: number;
  total_help: number;
  total_dead: number;
  member_count: number;
}

export function useAvailableKingdoms() {
  const [kingdoms, setKingdoms] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const allIds = new Set<number>();
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('kingdom_members')
          .select('kingdom_id')
          .range(offset, offset + 999);
        if (error) { console.error('Error fetching kingdoms:', error); break; }
        if (!data || data.length === 0) break;
        for (const r of data) allIds.add(r.kingdom_id);
        if (data.length < 1000) break;
        offset += 1000;
      }
      setKingdoms([...allIds].sort());
      setLoading(false);
    })();
  }, []);

  return { kingdoms, loading };
}

export function useKingdomDates(kingdomId: number | null) {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kingdomId) { setDates([]); setLoading(false); return; }

    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('kingdom_members')
        .select('dt')
        .eq('kingdom_id', kingdomId)
        .order('dt', { ascending: false })
        .limit(1000);
      if (error) console.error('Error fetching kingdom dates:', error);
      if (data) {
        const unique = [...new Set(data.map((r: { dt: string }) => r.dt))];
        setDates(unique);
      }
      setLoading(false);
    })();
  }, [kingdomId]);

  return { dates, loading };
}

/**
 * Fetch top N members for a kingdom on a specific date, sorted by power desc.
 */
export function useKingdomMembers(kingdomId: number | null, date: string | null, topN: number = 400) {
  const [members, setMembers] = useState<KingdomMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!kingdomId || !date) { setMembers([]); setLoading(false); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('kingdom_members')
        .select('*')
        .eq('kingdom_id', kingdomId)
        .eq('dt', date)
        .order('power', { ascending: false })
        .limit(topN);
      if (error) console.error('Error fetching kingdom members:', error);
      setMembers((data as KingdomMember[]) || []);
    } catch (err) {
      console.error('Error fetching kingdom members:', err);
      setMembers([]);
    }
    setLoading(false);
  }, [kingdomId, date, topN]);

  useEffect(() => { fetch(); }, [fetch]);

  return { members, loading, refetch: fetch };
}

/**
 * Fetch aggregates for multiple kingdoms, optionally filtered by date range.
 * Top 400 per kingdom/date are aggregated (sorted by power, take top 400).
 */
export function useKingdomAggregates(
  kingdomIds: number[],
  dateFrom: string | null = null,
  dateTo: string | null = null,
) {
  const [aggregates, setAggregates] = useState<KingdomAggregate[]>([]);
  const [loading, setLoading] = useState(true);

  const key = kingdomIds.join(',') + '|' + (dateFrom || '') + '|' + (dateTo || '');

  useEffect(() => {
    if (kingdomIds.length === 0) { setAggregates([]); setLoading(false); return; }

    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const allAggregates: KingdomAggregate[] = [];

        for (const kingdomId of kingdomIds) {
          let query = supabase
            .from('kingdom_members')
            .select('*')
            .eq('kingdom_id', kingdomId)
            .order('power', { ascending: false });

          if (dateFrom) query = query.gte('dt', dateFrom);
          if (dateTo) query = query.lte('dt', dateTo);

          const data = await fetchAllRows<KingdomMember>((range) =>
            query.range(range.from, range.to)
          );

          // Group by date, take top 400 per date
          const byDate = new Map<string, KingdomMember[]>();
          for (const row of data) {
            const arr = byDate.get(row.dt) || [];
            arr.push(row);
            byDate.set(row.dt, arr);
          }

          for (const [dt, members] of byDate) {
            // Already sorted by power desc from query, take top 400
            const top400 = members.slice(0, 400);
            allAggregates.push({
              dt,
              kingdom_id: kingdomId,
              total_power: top400.reduce((s, m) => s + (m.power || 0), 0),
              total_kill: top400.reduce((s, m) => s + (m.kill || 0), 0),
              total_collect: top400.reduce((s, m) => s + (m.collect || 0), 0),
              total_help: top400.reduce((s, m) => s + (m.help || 0), 0),
              total_dead: top400.reduce((s, m) => s + (m.dead || 0), 0),
              member_count: top400.length,
            });
          }
        }

        const sorted = allAggregates.sort((a, b) => a.dt.localeCompare(b.dt) || a.kingdom_id - b.kingdom_id);
        setAggregates(sorted);
      } catch (err) {
        console.error('Error fetching kingdom aggregates:', err);
        setAggregates([]);
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { aggregates, loading };
}

/**
 * Fetch all distinct dates across all kingdoms.
 */
export function useAllDates() {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const allDates = new Set<string>();
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from('kingdom_members')
          .select('dt')
          .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        for (const r of data) allDates.add(r.dt);
        if (data.length < 1000) break;
        offset += 1000;
      }
      setDates([...allDates].sort().reverse());
      setLoading(false);
    })();
  }, []);

  return { dates, loading };
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}
