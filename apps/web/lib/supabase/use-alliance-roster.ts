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

/**
 * Hook that fetches player data from the latest kingdom scan (migration tracker).
 * Returns the same shape as useAllianceRoster so it's a drop-in replacement.
 * Uses assigned_alliance (from AllianceSorter) first, falling back to current_alliance.
 */
export function useScanRoster(): UseAllianceRosterReturn & { scanLabel: string | null } {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanLabel, setScanLabel] = useState<string | null>(null);

  const fetchScanRoster = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Get the latest scan
      const { data: scans } = await supabase
        .from('kingdom_scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!scans || scans.length === 0) {
        setScanLabel(null);
        setRoster([]);
        setLoading(false);
        return;
      }

      const latestScan = scans[0];
      setScanLabel(latestScan.label || new Date(latestScan.created_at).toLocaleDateString());

      // Fetch all players for this scan in batches
      let allPlayers: Record<string, unknown>[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('kingdom_scan_players')
          .select('governor_id, name, power, kill_points, deaths, current_alliance, assigned_alliance, migration_status')
          .eq('scan_id', latestScan.id)
          .range(from, from + 999);

        if (!data || data.length === 0) break;
        allPlayers = allPlayers.concat(data);
        if (data.length < 1000) break;
        from += 1000;
      }

      // Map scan players to RosterMember shape
      const mapped: RosterMember[] = allPlayers
        .filter(p => {
          const alliance = (p.assigned_alliance as string) || (p.current_alliance as string) || '';
          // Include players with an alliance assignment, or any non-ILLEGAL player with a kingdom alliance
          if (p.assigned_alliance) return true;
          if (p.migration_status === 'ILLEGAL') return false;
          return !!alliance;
        })
        .map(p => ({
          id: String(p.governor_id),
          name: (p.name as string) || '',
          power: (p.power as number) || 0,
          kills: (p.kill_points as number) || 0,
          deads: (p.deaths as number) || 0,
          tier: null,
          role: null,
          notes: null,
          is_active: true,
          alliance: (p.assigned_alliance as string) || (p.current_alliance as string) || null,
          governor_id: (p.governor_id as number) || null,
          created_at: '',
          updated_at: '',
        }))
        .sort((a, b) => b.power - a.power);

      setRoster(mapped);
    } catch (err) {
      console.error('Error fetching scan roster:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch scan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScanRoster();
  }, [fetchScanRoster]);

  // Compute derived values (same as useAllianceRoster)
  const rosterNames = roster
    .map((m) => m.name)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const powerByName = roster.reduce(
    (acc, member) => { acc[member.name] = member.power; return acc; },
    {} as Record<string, number>
  );

  const killsByName = roster.reduce(
    (acc, member) => { acc[member.name] = member.kills; return acc; },
    {} as Record<string, number>
  );

  const allianceByName = roster.reduce(
    (acc, member) => { acc[member.name] = member.alliance; return acc; },
    {} as Record<string, string | null>
  );

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
    refetch: fetchScanRoster,
    scanLabel,
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
