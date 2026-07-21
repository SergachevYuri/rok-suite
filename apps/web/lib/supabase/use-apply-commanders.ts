'use client';

// Server-side truth for the /apply page's CommanderPicker. Reads from
// `apply_commanders` (populated via scripts/build-apply-commanders-sql.mjs) so
// officers can edit the list without a code deploy. Falls back to the legacy
// TS archive when Supabase can't be reached OR the table is empty — this
// keeps the picker functional on cold-start / new dev environments before
// the migration has been run.

import { useEffect, useState } from 'react';
import { createClient } from './client';
import { commanderReferences, type CommanderReference } from '@/lib/sunset-canyon/commander-reference';

interface ApplyCommandersState {
  commanders: CommanderReference[];
  loading: boolean;
  /** True when the list was served from the TS archive because Supabase was
   *  unreachable or the table was empty. Callers can surface a tiny hint. */
  usingFallback: boolean;
}

interface SupabaseRow {
  id: string;
  name: string;
  specialties: string[] | null;
  rarity: string | null;
  image_url: string | null;
  sort_order: number | null;
}

/** Coerce a DB row into the CommanderReference shape the picker already
 *  understands. Specialties defaults to an empty triple so `.slice(0,2)` on
 *  the render side doesn't blow up. Rarity defaults to 'legendary' — the
 *  picker's color map has all four values and legendary is the least visually
 *  jarring default. */
function toReference(row: SupabaseRow): CommanderReference {
  const specs = row.specialties ?? [];
  const trip: [string, string, string] = [
    specs[0] ?? '',
    specs[1] ?? '',
    specs[2] ?? '',
  ];
  const rarity = ((): CommanderReference['rarity'] => {
    switch (row.rarity) {
      case 'legendary':
      case 'epic':
      case 'elite':
      case 'advanced':
        return row.rarity;
      default:
        return 'legendary';
    }
  })();
  return {
    id: row.id,
    name: row.name,
    title: '',
    rarity,
    specialties: trip,
    imageUrl: row.image_url ?? '',
  };
}

// Module-level cache — the picker mounts / unmounts as officers navigate but
// the list is essentially static within a session. First mount does the fetch,
// every subsequent mount reads from cache.
let cache: CommanderReference[] | null = null;
let cachedUsedFallback = false;
let inFlight: Promise<CommanderReference[]> | null = null;

async function loadOnce(): Promise<CommanderReference[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const sb = createClient();
      const { data, error } = await sb
        .from('apply_commanders')
        .select('id, name, specialties, rarity, image_url, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as SupabaseRow[];
      if (rows.length === 0) {
        cachedUsedFallback = true;
        cache = commanderReferences;
      } else {
        cachedUsedFallback = false;
        cache = rows.map(toReference);
      }
      return cache;
    } catch (e) {
      console.warn('[useApplyCommanders] Supabase fetch failed — falling back to TS archive', e);
      cachedUsedFallback = true;
      cache = commanderReferences;
      return cache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useApplyCommanders(): ApplyCommandersState {
  const [state, setState] = useState<ApplyCommandersState>(() =>
    cache != null
      ? { commanders: cache, loading: false, usingFallback: cachedUsedFallback }
      : { commanders: commanderReferences, loading: true, usingFallback: true },
  );

  useEffect(() => {
    // Already resolved on the module — nothing to do.
    if (cache != null) {
      setState({ commanders: cache, loading: false, usingFallback: cachedUsedFallback });
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await loadOnce();
      if (!cancelled) {
        setState({ commanders: list, loading: false, usingFallback: cachedUsedFallback });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
