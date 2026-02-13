import { useState, useEffect, useCallback } from 'react';
import { createClient } from './client';

export interface RosterMember {
  id: string;
  name: string;
  power: number;
  kills: number;
  deads: number;
  tier: string | null;
  role: string | null;
  notes: string | null;
  is_active: boolean;
  alliance: string | null;
  governor_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface UseAllianceRosterReturn {
  roster: RosterMember[];
  rosterNames: string[];
  powerByName: Record<string, number>;
  killsByName: Record<string, number>;
  allianceByName: Record<string, string | null>;
  alliances: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAllianceRoster(allianceFilter?: string): UseAllianceRosterReturn {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      let query = supabase
        .from('alliance_roster')
        .select('*')
        .eq('is_active', true);

      // Apply alliance filter if provided (and not 'all')
      if (allianceFilter && allianceFilter !== 'all') {
        query = query.eq('alliance', allianceFilter);
      }

      const { data, error: fetchError } = await query.order('power', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setRoster(data || []);
    } catch (err) {
      console.error('Error fetching roster:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch roster');
    } finally {
      setLoading(false);
    }
  }, [allianceFilter]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Compute derived values
  const rosterNames = roster
    .map((m) => m.name)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const powerByName = roster.reduce(
    (acc, member) => {
      acc[member.name] = member.power;
      return acc;
    },
    {} as Record<string, number>
  );

  const killsByName = roster.reduce(
    (acc, member) => {
      acc[member.name] = member.kills;
      return acc;
    },
    {} as Record<string, number>
  );

  const allianceByName = roster.reduce(
    (acc, member) => {
      acc[member.name] = member.alliance;
      return acc;
    },
    {} as Record<string, string | null>
  );

  // Get unique alliances from roster (for dropdown options)
  const alliances = [...new Set(roster.map((m) => m.alliance).filter((a): a is string => a !== null))].sort();

  return {
    roster,
    rosterNames,
    powerByName,
    killsByName,
    allianceByName,
    alliances,
    loading,
    error,
    refetch: fetchRoster,
  };
}

// Utility to format power with M suffix
// Returns '-' for 0 or falsy values (no data entered)
export const formatPower = (power: number | null | undefined): string => {
  if (!power) return '-';
  if (power >= 1000000) {
    return (power / 1000000).toFixed(1) + 'M';
  }
  return power.toLocaleString();
};

export interface R4R5Member {
  governorId: number;
  name: string;
  role: string;
  alliance: string;
}

export function useR4R5Members() {
  const [members, setMembers] = useState<R4R5Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase
        .from('alliance_roster')
        .select('name, governor_id, role, alliance')
        .eq('is_active', true)
        .in('role', ['R4', 'R5'])
        .not('governor_id', 'is', null);

      setMembers(
        (data || []).map(d => ({
          governorId: d.governor_id!,
          name: d.name,
          role: d.role!,
          alliance: d.alliance || '',
        }))
      );
      setLoading(false);
    }
    fetch();
  }, []);

  return { members, loading };
}
