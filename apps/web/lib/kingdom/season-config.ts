'use client';

// Season switch — lets the candidate / outreach flow point at either the
// regular per-KvK seeds tables or the cross-season tables. The choice is
// persisted in sessionStorage so navigating between the candidates page and
// the outreach page keeps the same context.

import { useSyncExternalStore } from 'react';
import { MIG_FROM_DATE } from './migrations';

export type Season = 'kvk' | 'cross';

export interface SeasonConfig {
  /** Used by the URL-friendly toggle and persisted in sessionStorage. */
  key: Season;
  /** Short human label shown in the dropdown. */
  label: string;
  /** Supabase tables for this season. */
  tables: {
    stats: string;
    players: string;
    outreach: string;
  };
  /** Baseline date for "migrated since" comparisons. For cross-season we
   *  fall back to the earliest available scan_date at runtime. */
  fromDate: string | null;
}

export const SEASONS: Record<Season, SeasonConfig> = {
  kvk: {
    key: 'kvk',
    label: 'Same season (KvK3)',
    tables: {
      stats:    'seeds_kd_stats',
      players:  'seeds_kd_players',
      outreach: 'migration_outreach',
    },
    fromDate: MIG_FROM_DATE,
  },
  cross: {
    key: 'cross',
    label: 'Cross-season',
    tables: {
      stats:    'cross_season_kd_stats',
      players:  'cross_season_kd_players',
      outreach: 'cross_season_outreach',
    },
    fromDate: null, // resolved at runtime — earliest cross-season scan
  },
};

const STORAGE_KEY = 'rok-active-season';

function readStored(): Season {
  if (typeof window === 'undefined') return 'kvk';
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    if (v === 'cross' || v === 'kvk') return v;
  } catch { /* sessionStorage may be unavailable */ }
  return 'kvk';
}

const listeners = new Set<() => void>();

function notifyAll() {
  for (const l of listeners) l();
}

function writeStored(season: Season) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, season);
    notifyAll();
  } catch { /* sessionStorage may be unavailable */ }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  let removeStorage: (() => void) | null = null;
  if (typeof window !== 'undefined') {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY) callback();
    };
    window.addEventListener('storage', onStorage);
    removeStorage = () => window.removeEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (removeStorage) removeStorage();
  };
}

function getSnapshot(): Season {
  return readStored();
}

function getServerSnapshot(): Season {
  return 'kvk';
}

export function useSeason() {
  const season = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    season,
    config: SEASONS[season],
    setSeason: (s: Season) => writeStored(s),
  };
}
