import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient, fetchAllRows } from './client';

export type NameHistoryMap = Map<number, string[]>;

/**
 * Batch-load name history for a set of governor IDs.
 * Merges names from kingdom_scan_players (across all scans) and
 * alliance_roster.alternate_names, excluding the current display name.
 */
export function useNameHistory(
  governorIds: number[],
  currentNames: Map<number, string>,
): { nameHistory: NameHistoryMap; loading: boolean } {
  const [nameHistory, setNameHistory] = useState<NameHistoryMap>(new Map());
  const [loading, setLoading] = useState(false);
  const lastKeyRef = useRef('');

  // Stable sorted/deduped list for cache key
  const uniqueIds = useMemo(
    () => [...new Set(governorIds)].filter(id => id > 0).sort((a, b) => a - b),
    [governorIds],
  );

  const fetchHistory = useCallback(async () => {
    if (uniqueIds.length === 0) {
      setNameHistory(new Map());
      return;
    }

    const key = uniqueIds.join(',');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setLoading(true);
    const supabase = createClient();
    const namesByGov = new Map<number, Set<string>>();
    for (const id of uniqueIds) namesByGov.set(id, new Set());

    // 1. All names from kingdom_scan_players across every scan
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const rows = await fetchAllRows<{ governor_id: number; name: string }>(
        (range) =>
          supabase
            .from('kingdom_scan_players')
            .select('governor_id, name')
            .in('governor_id', batch)
            .range(range.from, range.to),
      );
      for (const row of rows) {
        namesByGov.get(row.governor_id)?.add(row.name);
      }
    }

    // 2. alternate_names from alliance_roster
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const { data } = await supabase
        .from('alliance_roster')
        .select('governor_id, name, alternate_names')
        .in('governor_id', batch);
      if (data) {
        for (const row of data) {
          if (!row.governor_id) continue;
          const set = namesByGov.get(row.governor_id);
          if (!set) continue;
          if (row.name) set.add(row.name);
          if (row.alternate_names) {
            for (const alt of row.alternate_names as string[]) {
              set.add(alt);
            }
          }
        }
      }
    }

    // 3. Exclude current display name, keep only players with history
    const result: NameHistoryMap = new Map();
    for (const [govId, nameSet] of namesByGov) {
      const current = currentNames.get(govId)?.toLowerCase();
      const previous = [...nameSet].filter(n => n.toLowerCase() !== current);
      if (previous.length > 0) {
        result.set(govId, previous);
      }
    }

    setNameHistory(result);
    setLoading(false);
  }, [uniqueIds, currentNames]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { nameHistory, loading };
}
