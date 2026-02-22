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
      const { data } = await supabase
        .from('kingdom_members')
        .select('kingdom_id')
        .limit(1000);

      if (data) {
        const unique = [...new Set(data.map((r: { kingdom_id: number }) => r.kingdom_id))].sort();
        setKingdoms(unique);
      }
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
      const { data } = await supabase
        .from('kingdom_members')
        .select('dt')
        .eq('kingdom_id', kingdomId)
        .order('dt', { ascending: false })
        .limit(1000);

      if (data) {
        const unique = [...new Set(data.map((r: { dt: string }) => r.dt))];
        setDates(unique);
      }
      setLoading(false);
    })();
  }, [kingdomId]);

  return { dates, loading };
}

export function useKingdomMembers(kingdomId: number | null, date: string | null) {
  const [members, setMembers] = useState<KingdomMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!kingdomId || !date) { setMembers([]); setLoading(false); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const data = await fetchAllRows<KingdomMember>((range) =>
        supabase
          .from('kingdom_members')
          .select('*')
          .eq('kingdom_id', kingdomId)
          .eq('dt', date)
          .order('power', { ascending: false })
          .range(range.from, range.to)
      );
      setMembers(data);
    } catch (err) {
      console.error('Error fetching kingdom members:', err);
      setMembers([]);
    }
    setLoading(false);
  }, [kingdomId, date]);

  useEffect(() => { fetch(); }, [fetch]);

  return { members, loading, refetch: fetch };
}

export function useKingdomAggregates(kingdomId: number | null) {
  const [aggregates, setAggregates] = useState<KingdomAggregate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kingdomId) { setAggregates([]); setLoading(false); return; }

    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        // Fetch all members for this kingdom, then aggregate client-side
        const data = await fetchAllRows<KingdomMember>((range) =>
          supabase
            .from('kingdom_members')
            .select('*')
            .eq('kingdom_id', kingdomId)
            .range(range.from, range.to)
        );

        // Group by date
        const byDate = new Map<string, KingdomAggregate>();
        for (const row of data) {
          const existing = byDate.get(row.dt);
          if (existing) {
            existing.total_power += row.power || 0;
            existing.total_kill += row.kill || 0;
            existing.total_collect += row.collect || 0;
            existing.total_help += row.help || 0;
            existing.total_dead += row.dead || 0;
            existing.member_count += 1;
          } else {
            byDate.set(row.dt, {
              dt: row.dt,
              total_power: row.power || 0,
              total_kill: row.kill || 0,
              total_collect: row.collect || 0,
              total_help: row.help || 0,
              total_dead: row.dead || 0,
              member_count: 1,
            });
          }
        }

        const sorted = Array.from(byDate.values()).sort((a, b) => a.dt.localeCompare(b.dt));
        setAggregates(sorted);
      } catch (err) {
        console.error('Error fetching kingdom aggregates:', err);
        setAggregates([]);
      }
      setLoading(false);
    })();
  }, [kingdomId]);

  return { aggregates, loading };
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}
