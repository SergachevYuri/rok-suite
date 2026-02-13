import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Scan, ScanPlayer, MergedPlayer, PlayerAssignment } from '@/lib/kingdom/types';

export function useLatestScan() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [players, setPlayers] = useState<ScanPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLatest = useCallback(async () => {
    setLoading(true);

    // Get the latest scan
    const { data: scans } = await supabase
      .from('kingdom_scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!scans || scans.length === 0) {
      setScan(null);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const latestScan = scans[0] as Scan;
    setScan(latestScan);

    // Fetch all players for this scan in batches
    let allPlayers: ScanPlayer[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('kingdom_scan_players')
        .select('*')
        .eq('scan_id', latestScan.id)
        .range(from, from + 999);

      if (!data || data.length === 0) break;
      allPlayers = allPlayers.concat(data as ScanPlayer[]);
      if (data.length < 1000) break;
      from += 1000;
    }

    setPlayers(allPlayers);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  return { scan, players, loading, refetch: fetchLatest };
}

/**
 * Upload a new scan with merged player data to Supabase.
 * Returns the created scan ID or null on error.
 */
export async function uploadScan(
  label: string,
  mergedPlayers: MergedPlayer[],
  counts: { snapshot: number; kingdom: number; migrant: number; preMigration: number },
): Promise<number | null> {
  // Create scan record
  const { data: scanData, error: scanError } = await supabase
    .from('kingdom_scans')
    .insert({
      label,
      snapshot_count: counts.snapshot,
      kingdom_count: counts.kingdom,
      migrant_count: counts.migrant,
      pre_migration_count: counts.preMigration,
    })
    .select('id')
    .single();

  if (scanError || !scanData) {
    console.error('Failed to create scan:', scanError);
    return null;
  }

  const scanId = scanData.id;

  // Convert MergedPlayer[] to Supabase rows and batch upsert
  const rows = mergedPlayers.map(p => ({
    scan_id: scanId,
    governor_id: p.governorId,
    name: p.name,
    power: p.power,
    highest_power: p.highestPower,
    kill_points: p.killPoints,
    t4_kills: p.t4Kills,
    t5_kills: p.t5Kills,
    deaths: p.deaths,
    gathered: p.gathered,
    alliance_helps: p.allianceHelps,
    current_alliance: p.currentAlliance,
    x: p.x,
    y: p.y,
    castle_hall: p.castleHall,
    shield_time_left: p.shieldTimeLeft,
    migration_status: p.migrationStatus,
    is_migrant: p.isMigrant,
    migrant_accepted: p.migrantAccepted,
    migrant_group: p.migrantGroup,
    migrant_recruiter: p.migrantRecruiter,
    starting_kd: p.startingKd,
    existed_pre_migration: p.existedPreMigration,
    sources: p.sources,
  }));

  // Upsert in batches of 500
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('kingdom_scan_players')
      .upsert(batch, { onConflict: 'scan_id,governor_id' });

    if (error) {
      console.error(`Failed to upsert batch ${i}:`, error);
      return null;
    }
  }

  return scanId;
}

/**
 * Save alliance assignments back to Supabase for the given scan.
 */
export async function saveAssignments(
  scanId: number,
  assignments: PlayerAssignment[],
): Promise<boolean> {
  // Update in batches
  for (let i = 0; i < assignments.length; i += 100) {
    const batch = assignments.slice(i, i + 100);
    for (const a of batch) {
      const { error } = await supabase
        .from('kingdom_scan_players')
        .update({
          assigned_alliance: a.assignedAlliance || null,
          assignment_status: a.status,
          assignment_reason: a.reason,
        })
        .eq('scan_id', scanId)
        .eq('governor_id', a.governorId);

      if (error) {
        console.error(`Failed to update assignment for ${a.governorId}:`, error);
        return false;
      }
    }
  }

  return true;
}
