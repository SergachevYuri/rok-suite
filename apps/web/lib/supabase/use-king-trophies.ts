/**
 * Hook for managing King's Recognition trophies
 *
 * Trophy Types:
 * - legendary: 1 per week (rarest)
 * - epic: 2 per week
 * - elite: 5 per week
 * - advanced: 10 per week
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export type TrophyType = 'legendary' | 'epic' | 'elite' | 'advanced';

export interface Trophy {
  id: string;
  member_id: string;
  trophy_type: TrophyType;
  awarded_date: string;
  week_of: string;
  reason: string | null;
  created_at: string;
}

export interface TrophyWithMember extends Trophy {
  member_name: string;
  member_alliance: string | null;
  member_power: number;
}

export interface MemberTrophyCounts {
  member_id: string;
  legendary_count: number;
  epic_count: number;
  elite_count: number;
  advanced_count: number;
  total_count: number;
  last_awarded: string | null;
}

// Trophy configuration
export const TROPHY_CONFIG: Record<TrophyType, {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  maxPerWeek: number;
  rarity: number; // 1-4, higher = rarer
}> = {
  legendary: {
    label: 'Legendary',
    emoji: '👑',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    maxPerWeek: 1,
    rarity: 4,
  },
  epic: {
    label: 'Epic',
    emoji: '💎',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    maxPerWeek: 2,
    rarity: 3,
  },
  elite: {
    label: 'Elite',
    emoji: '⭐',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    maxPerWeek: 5,
    rarity: 2,
  },
  advanced: {
    label: 'Advanced',
    emoji: '🏅',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    maxPerWeek: 10,
    rarity: 1,
  },
};

// Get the Monday of the current week
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

// Format date for display
export function formatTrophyDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Hook to fetch all trophies with member info
export function useKingTrophies() {
  const [trophies, setTrophies] = useState<TrophyWithMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrophies = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('king_trophies')
      .select(`
        *,
        alliance_roster!inner (
          name,
          alliance,
          power
        )
      `)
      .order('awarded_date', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const formatted = (data || []).map((t: Record<string, unknown>) => ({
      ...t,
      member_name: (t.alliance_roster as Record<string, unknown>)?.name as string,
      member_alliance: (t.alliance_roster as Record<string, unknown>)?.alliance as string | null,
      member_power: (t.alliance_roster as Record<string, unknown>)?.power as number,
    })) as TrophyWithMember[];

    setTrophies(formatted);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrophies();
  }, [fetchTrophies]);

  return { trophies, loading, error, refetch: fetchTrophies };
}

// Hook to fetch trophy counts per member (for roster display)
export function useMemberTrophyCounts() {
  const [counts, setCounts] = useState<Map<string, MemberTrophyCounts>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('member_trophy_counts')
      .select('*');

    if (fetchError) {
      // View might not exist yet, fail silently
      console.warn('member_trophy_counts view not found:', fetchError.message);
      setLoading(false);
      return;
    }

    const countsMap = new Map<string, MemberTrophyCounts>();
    for (const row of data || []) {
      countsMap.set(row.member_id, row as MemberTrophyCounts);
    }

    setCounts(countsMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, loading, error, refetch: fetchCounts };
}

// Award a trophy
export async function awardTrophy(
  memberId: string,
  trophyType: TrophyType,
  reason?: string,
  weekOf?: string
): Promise<{ success: boolean; error?: string }> {
  const week = weekOf || getWeekStart();

  const { error } = await supabase
    .from('king_trophies')
    .insert({
      member_id: memberId,
      trophy_type: trophyType,
      week_of: week,
      reason: reason || null,
    });

  if (error) {
    if (error.message.includes('duplicate')) {
      return { success: false, error: 'This member already has this trophy type for this week' };
    }
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Remove a trophy
export async function removeTrophy(trophyId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('king_trophies')
    .delete()
    .eq('id', trophyId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Get trophies for a specific week
export async function getTrophiesForWeek(weekOf: string): Promise<TrophyWithMember[]> {
  const { data, error } = await supabase
    .from('king_trophies')
    .select(`
      *,
      alliance_roster!inner (
        name,
        alliance,
        power
      )
    `)
    .eq('week_of', weekOf)
    .order('trophy_type');

  if (error) {
    console.error('Error fetching week trophies:', error);
    return [];
  }

  return (data || []).map((t: Record<string, unknown>) => ({
    ...t,
    member_name: (t.alliance_roster as Record<string, unknown>)?.name as string,
    member_alliance: (t.alliance_roster as Record<string, unknown>)?.alliance as string | null,
    member_power: (t.alliance_roster as Record<string, unknown>)?.power as number,
  })) as TrophyWithMember[];
}

// Get all unique weeks that have trophies
export async function getTrophyWeeks(): Promise<string[]> {
  const { data, error } = await supabase
    .from('king_trophies')
    .select('week_of')
    .order('week_of', { ascending: false });

  if (error) {
    console.error('Error fetching trophy weeks:', error);
    return [];
  }

  // Get unique weeks
  const weeks = [...new Set((data || []).map(d => d.week_of))];
  return weeks;
}

// Calculate trophy "score" for ranking
export function calculateTrophyScore(counts: MemberTrophyCounts): number {
  return (
    counts.legendary_count * 100 +
    counts.epic_count * 50 +
    counts.elite_count * 20 +
    counts.advanced_count * 5
  );
}

// Trophy badge component helper - returns trophy display info
export function getTrophyBadgeInfo(counts: MemberTrophyCounts | undefined): {
  display: string;
  tooltip: string;
  hasAny: boolean;
} {
  if (!counts || counts.total_count === 0) {
    return { display: '', tooltip: '', hasAny: false };
  }

  const parts: string[] = [];
  const tooltipParts: string[] = [];

  if (counts.legendary_count > 0) {
    parts.push(`${TROPHY_CONFIG.legendary.emoji}${counts.legendary_count > 1 ? counts.legendary_count : ''}`);
    tooltipParts.push(`${counts.legendary_count} Legendary`);
  }
  if (counts.epic_count > 0) {
    parts.push(`${TROPHY_CONFIG.epic.emoji}${counts.epic_count > 1 ? counts.epic_count : ''}`);
    tooltipParts.push(`${counts.epic_count} Epic`);
  }
  if (counts.elite_count > 0) {
    parts.push(`${TROPHY_CONFIG.elite.emoji}${counts.elite_count > 1 ? counts.elite_count : ''}`);
    tooltipParts.push(`${counts.elite_count} Elite`);
  }
  if (counts.advanced_count > 0) {
    parts.push(`${TROPHY_CONFIG.advanced.emoji}${counts.advanced_count > 1 ? counts.advanced_count : ''}`);
    tooltipParts.push(`${counts.advanced_count} Advanced`);
  }

  return {
    display: parts.join(' '),
    tooltip: `King's Recognition: ${tooltipParts.join(', ')}`,
    hasAny: true,
  };
}
