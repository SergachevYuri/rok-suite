import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Scan, ScanPlayer, MergedPlayer, PlayerAssignment, MigrantRow, InactiveRow, MigrationStatus, OfficerStatus, PlayerOverride } from '@/lib/kingdom/types';
import { isKingdomAlliance, toSorterTag, normalizeName } from '@/lib/kingdom/config';

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
 * Save a single alliance assignment to Supabase for the given scan.
 */
export async function saveSingleAssignment(
  scanId: number,
  assignment: PlayerAssignment,
): Promise<boolean> {
  const { error } = await supabase
    .from('kingdom_scan_players')
    .update({
      assigned_alliance: assignment.assignedAlliance || null,
      assignment_status: assignment.status,
      assignment_reason: assignment.reason,
    })
    .eq('scan_id', scanId)
    .eq('governor_id', assignment.governorId);

  if (error) {
    console.error(`Failed to update assignment for ${assignment.governorId}:`, error);
    return false;
  }
  return true;
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

/**
 * Fetch all stored pre-migration governor IDs from Supabase.
 */
export async function fetchPreMigrationIds(): Promise<Set<number>> {
  const ids = new Set<number>();
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('pre_migration_governors')
      .select('governor_id')
      .range(from, from + 999);

    if (!data || data.length === 0) break;
    for (const row of data) ids.add(row.governor_id);
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}

/**
 * Replace all stored pre-migration governor IDs with a new set.
 */
export async function savePreMigrationIds(ids: Set<number>): Promise<boolean> {
  // Delete all existing
  const { error: delError } = await supabase
    .from('pre_migration_governors')
    .delete()
    .gte('governor_id', 0);

  if (delError) {
    console.error('Failed to clear pre_migration_governors:', delError);
    return false;
  }

  // Batch insert
  const rows = Array.from(ids).map(id => ({ governor_id: id }));
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('pre_migration_governors')
      .insert(batch);

    if (error) {
      console.error(`Failed to insert pre_migration batch ${i}:`, error);
      return false;
    }
  }

  return true;
}

/**
 * Fetch active roster members with both governor IDs and normalized names.
 * Used as an additional source of truth — known roster members are ORIGINAL.
 * Returns both sets so matching can work by governor_id OR by name.
 */
export async function fetchRosterLookup(): Promise<{ ids: Set<number>; normalizedNames: Set<string> }> {
  const ids = new Set<number>();
  const normalizedNames = new Set<string>();
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('alliance_roster')
      .select('governor_id, name, alternate_names')
      .eq('is_active', true)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.governor_id) ids.add(row.governor_id);
      if (row.name) {
        const norm = normalizeName(row.name);
        if (norm) normalizedNames.add(norm);
      }
      if (row.alternate_names) {
        for (const alt of row.alternate_names as string[]) {
          const norm = normalizeName(alt);
          if (norm) normalizedNames.add(norm);
        }
      }
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return { ids, normalizedNames };
}

/**
 * Get the count of stored pre-migration governor IDs without fetching all rows.
 */
export async function getPreMigrationCount(): Promise<number> {
  const { count } = await supabase
    .from('pre_migration_governors')
    .select('*', { count: 'exact', head: true });

  return count ?? 0;
}

/**
 * Update the alliance_roster table from scan data.
 * Updates power, alliance, governor_id, castle_hall for kingdom alliance members.
 * Does NOT update kills/KP (kingdom exports give cumulative KP between dates).
 * Adds new kingdom alliance members. Creates a roster snapshot afterward.
 */
export async function updateRosterFromScan(
  mergedPlayers: MergedPlayer[],
): Promise<{ updated: number; added: number } | null> {
  // Filter to kingdom alliance members and map to sorter tags
  const kingdomPlayers = mergedPlayers
    .filter(p => p.currentAlliance && isKingdomAlliance(p.currentAlliance))
    .map(p => ({ ...p, sorterAlliance: toSorterTag(p.currentAlliance) }));

  if (kingdomPlayers.length === 0) return { updated: 0, added: 0 };

  // Fetch existing active roster in batches
  type RosterRow = { id: string; name: string; governor_id: number | null; alternate_names: string[] | null };
  let existing: RosterRow[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('alliance_roster')
      .select('id, name, governor_id, alternate_names')
      .eq('is_active', true)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    existing = existing.concat(data as RosterRow[]);
    if (data.length < 1000) break;
    from += 1000;
  }

  // Build lookup maps
  const govIdToRow = new Map<number, RosterRow>();
  const nameToRow = new Map<string, RosterRow>();
  const normalizedToRow = new Map<string, RosterRow>();

  for (const r of existing) {
    if (r.governor_id) govIdToRow.set(r.governor_id, r);
    nameToRow.set(r.name.toLowerCase(), r);
    const norm = normalizeName(r.name);
    if (norm.length >= 2) normalizedToRow.set(norm, r);
    if (r.alternate_names) {
      for (const alt of r.alternate_names) {
        nameToRow.set(alt.toLowerCase(), r);
        const normAlt = normalizeName(alt);
        if (normAlt.length >= 2) normalizedToRow.set(normAlt, r);
      }
    }
  }

  let updated = 0;
  let added = 0;

  // Collect updates and inserts, then execute in parallel batches
  const updateOps: { id: string; data: Record<string, unknown> }[] = [];
  const insertOps: Record<string, unknown>[] = [];

  for (const p of kingdomPlayers) {
    // Match: governor_id → exact name → normalized name
    let match: RosterRow | undefined;
    if (p.governorId && govIdToRow.has(p.governorId)) {
      match = govIdToRow.get(p.governorId);
    } else if (nameToRow.has(p.name.toLowerCase())) {
      match = nameToRow.get(p.name.toLowerCase());
    } else {
      const norm = normalizeName(p.name);
      if (norm.length >= 2) match = normalizedToRow.get(norm);
    }

    if (match) {
      const updateData: Record<string, unknown> = {
        power: p.power,
        alliance: p.sorterAlliance,
      };
      if (p.governorId) updateData.governor_id = p.governorId;
      if (p.castleHall) updateData.castle_hall = p.castleHall;
      if (p.gathered > 0) updateData.gathered = p.gathered;
      if (p.allianceHelps > 0) updateData.alliance_helps = p.allianceHelps;

      // Track name changes: if governor_id matched but name differs, record the old name
      if (p.name && match.name && p.name.toLowerCase() !== match.name.toLowerCase()) {
        const existingAlts: string[] = match.alternate_names || [];
        if (!existingAlts.some(a => a.toLowerCase() === match.name.toLowerCase())) {
          updateData.alternate_names = [...existingAlts, match.name];
        }
        updateData.name = p.name;
      }

      updateOps.push({ id: match.id, data: updateData });
    } else {
      insertOps.push({
        name: p.name,
        power: p.power,
        kills: 0,
        deads: 0,
        governor_id: p.governorId || null,
        castle_hall: p.castleHall,
        alliance: p.sorterAlliance,
        gathered: p.gathered || 0,
        alliance_helps: p.allianceHelps || 0,
        is_active: true,
      });
    }
  }

  // Execute updates in parallel batches of 20
  for (let i = 0; i < updateOps.length; i += 20) {
    const batch = updateOps.slice(i, i + 20);
    const results = await Promise.all(
      batch.map(op => supabase.from('alliance_roster').update(op.data).eq('id', op.id))
    );
    updated += results.filter(r => !r.error).length;
  }

  // Batch insert new members
  for (let i = 0; i < insertOps.length; i += 100) {
    const batch = insertOps.slice(i, i + 100);
    const { error } = await supabase
      .from('alliance_roster')
      .upsert(batch, { onConflict: 'name' });
    if (!error) added += batch.length;
  }

  // Create roster snapshot
  let snapshotMembers: { name: string; power: number; kills: number; t4_kills: number; t5_kills: number; honor_points: number; gathered: number; alliance_helps: number; role: string | null }[] = [];
  from = 0;
  while (true) {
    const { data } = await supabase
      .from('alliance_roster')
      .select('name, power, kills, t4_kills, t5_kills, honor_points, gathered, alliance_helps, role')
      .eq('is_active', true)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    snapshotMembers = snapshotMembers.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const today = new Date().toISOString().split('T')[0];
  const snapshotRows = snapshotMembers.map(m => ({
    snapshot_date: today,
    member_name: m.name,
    power: m.power || 0,
    kills: m.kills || 0,
    t4_kills: m.t4_kills || 0,
    t5_kills: m.t5_kills || 0,
    honor_points: m.honor_points || 0,
    gathered: m.gathered || 0,
    alliance_helps: m.alliance_helps || 0,
    role: m.role || null,
    is_active: true,
  }));

  for (let i = 0; i < snapshotRows.length; i += 500) {
    const batch = snapshotRows.slice(i, i + 500);
    await supabase
      .from('roster_snapshots')
      .upsert(batch, { onConflict: 'snapshot_date,member_name' });
  }

  return { updated, added };
}

/**
 * Refresh migrant statuses on an existing scan by re-fetching the Google Sheet.
 * Updates migration_status and migrant fields without requiring a new scan upload.
 */
export async function refreshMigrantsOnScan(
  scanId: number,
  migrants: MigrantRow[],
  inactives?: InactiveRow[],
): Promise<{ updated: number; statusChanges: number }> {
  // 1. Fetch all players for this scan
  let allPlayers: ScanPlayer[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('kingdom_scan_players')
      .select('*')
      .eq('scan_id', scanId)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allPlayers = allPlayers.concat(data as ScanPlayer[]);
    if (data.length < 1000) break;
    from += 1000;
  }

  if (allPlayers.length === 0) return { updated: 0, statusChanges: 0 };

  // 2. Fetch roster + pre-migration data — known members are ORIGINAL
  const [roster, preMigrationIds] = await Promise.all([
    fetchRosterLookup(),
    fetchPreMigrationIds(),
  ]);

  // 3. Build lookup maps
  const migrantByGovId = new Map<number, MigrantRow>();
  const migrantByNorm = new Map<string, MigrantRow>();
  for (const m of migrants) {
    if (m.governorId) migrantByGovId.set(m.governorId, m);
    const norm = normalizeName(m.name);
    if (norm) migrantByNorm.set(norm, m);
  }

  const inactiveByGovId = new Map<number, InactiveRow>();
  const inactiveByNorm = new Map<string, InactiveRow>();
  if (inactives) {
    for (const row of inactives) {
      if (row.governorId) inactiveByGovId.set(row.governorId, row);
      const norm = normalizeName(row.name);
      if (norm) inactiveByNorm.set(norm, row);
    }
  }

  type PlayerUpdate = {
    governor_id: number;
    migration_status: MigrationStatus;
    is_migrant: boolean;
    migrant_accepted: boolean;
    migrant_group: string | null;
    migrant_recruiter: string | null;
    starting_kd: string | null;
  };

  const updates: PlayerUpdate[] = [];
  let statusChanges = 0;

  // 4. For each player, determine status using governor_id first, name as fallback.
  //
  // Priority order:
  //   0. Inactives sheet match → INACTIVE (highest priority)
  //   1. Governor ID match on migrant sheet → status from sheet (migrant sheet is explicit, wins over roster)
  //   2. Name match on migrant sheet (only if governor_ids don't conflict) → status from sheet
  //   3. Governor ID on roster → ORIGINAL
  //   4. Name match on roster → ORIGINAL
  //   5. Governor ID in pre-migration → ORIGINAL (fallback for non-roster, non-migrant players)
  //   6. Previously migrant but no longer on any list → ORIGINAL (cleared by leadership)
  //   7. No match → stays as-is
  //
  // Migrant sheet is checked before roster because the roster gets auto-populated
  // by updateRosterFromScan — accepted migrants in kingdom alliances would otherwise
  // be overwritten to ORIGINAL on every refresh.
  //
  // After computing status, officer overrides are applied (cleared → ORIGINAL).

  for (const player of allPlayers) {
    const playerNorm = normalizeName(player.name);

    // --- Step 0: Inactives sheet match → INACTIVE ---
    if (inactiveByGovId.size > 0 || inactiveByNorm.size > 0) {
      const inactiveMatch = (player.governor_id ? inactiveByGovId.get(player.governor_id) : undefined)
        || (playerNorm ? inactiveByNorm.get(playerNorm) : undefined);
      if (inactiveMatch) {
        const update = buildInactiveUpdate(player);
        if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
        continue;
      }
    }

    // --- Step 1: Governor ID match on migrant sheet → status from sheet ---
    const migrantById = player.governor_id ? migrantByGovId.get(player.governor_id) : undefined;
    if (migrantById) {
      const update = buildMigrantUpdate(player, migrantById);
      if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
      continue;
    }

    // --- Step 2: Name match on migrant sheet (only if governor_ids don't conflict) ---
    if (playerNorm) {
      const migrantByName = migrantByNorm.get(playerNorm);
      if (migrantByName && (!migrantByName.governorId || !player.governor_id || migrantByName.governorId === player.governor_id)) {
        const update = buildMigrantUpdate(player, migrantByName);
        if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
        continue;
      }
    }

    // --- Step 3: Governor ID on roster → ORIGINAL ---
    if (roster.ids.has(player.governor_id)) {
      const update = buildOriginalUpdate(player);
      if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
      continue;
    }

    // --- Step 4: Name match on roster → ORIGINAL ---
    if (playerNorm && roster.normalizedNames.has(playerNorm)) {
      const update = buildOriginalUpdate(player);
      if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
      continue;
    }

    // --- Step 5: Governor ID in pre-migration → ORIGINAL ---
    if (preMigrationIds.has(player.governor_id)) {
      const update = buildOriginalUpdate(player);
      if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
      continue;
    }

    // --- Step 6: Previously migrant but no longer on any list → ORIGINAL ---
    // Skip accepted migrants — they were intentionally added (e.g. via manual DB insert)
    if (player.is_migrant && !player.migrant_accepted) {
      const update = buildOriginalUpdate(player);
      if (update) { updates.push(update.data); if (update.statusChanged) statusChanges++; }
      continue;
    }

    // --- Step 7: No match → stays as-is (ILLEGAL if that's what it was) ---
  }

  function buildMigrantUpdate(player: ScanPlayer, migrant: MigrantRow): { data: PlayerUpdate; statusChanged: boolean } | null {
    const acceptedVal = migrant.accepted.toLowerCase().trim();
    const illegalVal = migrant.illegalMigrant.toLowerCase().trim();
    const migrantAccepted = acceptedVal === 'yes' || acceptedVal === 'y';
    let migrationStatus: MigrationStatus;
    if (illegalVal === 'yes' || illegalVal === 'y') migrationStatus = 'ILLEGAL';
    else if (migrantAccepted) migrationStatus = 'ACCEPTED';
    else migrationStatus = 'PENDING';

    const changed =
      player.migration_status !== migrationStatus ||
      player.is_migrant !== true ||
      player.migrant_accepted !== migrantAccepted ||
      player.migrant_group !== (migrant.group || null) ||
      player.migrant_recruiter !== (migrant.recruiter || null) ||
      player.starting_kd !== (migrant.startingKd || null);

    if (!changed) return null;
    return {
      data: {
        governor_id: player.governor_id,
        migration_status: migrationStatus,
        is_migrant: true,
        migrant_accepted: migrantAccepted,
        migrant_group: migrant.group || null,
        migrant_recruiter: migrant.recruiter || null,
        starting_kd: migrant.startingKd || null,
      },
      statusChanged: player.migration_status !== migrationStatus,
    };
  }

  function buildOriginalUpdate(player: ScanPlayer): { data: PlayerUpdate; statusChanged: boolean } | null {
    const changed = player.migration_status !== 'ORIGINAL' || player.is_migrant;
    if (!changed) return null;
    return {
      data: {
        governor_id: player.governor_id,
        migration_status: 'ORIGINAL',
        is_migrant: false,
        migrant_accepted: false,
        migrant_group: null,
        migrant_recruiter: null,
        starting_kd: null,
      },
      statusChanged: player.migration_status !== 'ORIGINAL',
    };
  }

  function buildInactiveUpdate(player: ScanPlayer): { data: PlayerUpdate; statusChanged: boolean } | null {
    const changed = player.migration_status !== 'INACTIVE';
    if (!changed) return null;
    return {
      data: {
        governor_id: player.governor_id,
        migration_status: 'INACTIVE',
        is_migrant: player.is_migrant,
        migrant_accepted: player.migrant_accepted,
        migrant_group: player.migrant_group,
        migrant_recruiter: player.migrant_recruiter,
        starting_kd: player.starting_kd,
      },
      statusChanged: true,
    };
  }

  // 4b. Apply officer overrides (cleared → ORIGINAL)
  const overrides = await fetchPlayerOverrides();
  for (const update of updates) {
    const override = overrides.get(update.governor_id);
    if (override?.officer_status === 'cleared' && update.migration_status !== 'ORIGINAL') {
      statusChanges++;
      update.migration_status = 'ORIGINAL';
      update.is_migrant = false;
      update.migrant_accepted = false;
    }
  }
  // Also check players not in the updates list that have a 'cleared' override
  const updatedIds = new Set(updates.map(u => u.governor_id));
  for (const player of allPlayers) {
    if (updatedIds.has(player.governor_id)) continue;
    const override = overrides.get(Number(player.governor_id));
    if (override?.officer_status === 'cleared' && player.migration_status !== 'ORIGINAL') {
      updates.push({
        governor_id: player.governor_id,
        migration_status: 'ORIGINAL',
        is_migrant: false,
        migrant_accepted: false,
        migrant_group: null,
        migrant_recruiter: null,
        starting_kd: null,
      });
      statusChanges++;
    }
  }

  // 5. Update changed players in parallel batches of 20
  for (let i = 0; i < updates.length; i += 20) {
    const batch = updates.slice(i, i + 20);
    await Promise.all(batch.map(u =>
      supabase
        .from('kingdom_scan_players')
        .update({
          migration_status: u.migration_status,
          is_migrant: u.is_migrant,
          migrant_accepted: u.migrant_accepted,
          migrant_group: u.migrant_group,
          migrant_recruiter: u.migrant_recruiter,
          starting_kd: u.starting_kd,
        })
        .eq('scan_id', scanId)
        .eq('governor_id', u.governor_id)
    ));
  }

  // 6. Backfill pre_migration_governors with IDs we just set to ORIGINAL
  // so future refreshes/uploads won't re-derive the same players.
  const newOriginalIds = updates
    .filter(u => u.migration_status === 'ORIGINAL' && !preMigrationIds.has(u.governor_id))
    .map(u => ({ governor_id: u.governor_id }));
  if (newOriginalIds.length > 0) {
    for (let i = 0; i < newOriginalIds.length; i += 500) {
      const batch = newOriginalIds.slice(i, i + 500);
      await supabase.from('pre_migration_governors').upsert(batch, { onConflict: 'governor_id' });
    }
  }

  // 7. Insert flagged migrants from the sheet that aren't in the scan yet.
  //    These are people who arrived after the scan was taken.
  const existingGovIds = new Set(allPlayers.map(p => p.governor_id));
  const newFlaggedPlayers: {
    scan_id: number;
    governor_id: number;
    name: string;
    power: number;
    highest_power: number;
    kill_points: number;
    t4_kills: number;
    t5_kills: number;
    deaths: number;
    current_alliance: string;
    migration_status: MigrationStatus;
    is_migrant: boolean;
    migrant_accepted: boolean;
    migrant_group: string | null;
    migrant_recruiter: string | null;
    starting_kd: string | null;
    sources: string[];
  }[] = [];

  for (const m of migrants) {
    if (!m.governorId || existingGovIds.has(m.governorId)) continue;
    const illegalVal = m.illegalMigrant.toLowerCase().trim();
    const acceptedVal = m.accepted.toLowerCase().trim();
    const isIllegal = illegalVal === 'yes' || illegalVal === 'y';
    const isAccepted = acceptedVal === 'yes' || acceptedVal === 'y';
    // Only auto-insert flagged (illegal/pending) migrants, not accepted ones
    if (isAccepted && !isIllegal) continue;
    const migrationStatus: MigrationStatus = isIllegal ? 'ILLEGAL' : 'PENDING';
    newFlaggedPlayers.push({
      scan_id: scanId,
      governor_id: m.governorId,
      name: m.name,
      power: m.power || 0,
      highest_power: m.power || 0,
      kill_points: m.killPoints || 0,
      t4_kills: m.t4Kills || 0,
      t5_kills: m.t5Kills || 0,
      deaths: m.deads || 0,
      current_alliance: m.alliance || '',
      migration_status: migrationStatus,
      is_migrant: true,
      migrant_accepted: false,
      migrant_group: m.group || null,
      migrant_recruiter: m.recruiter || null,
      starting_kd: m.startingKd || null,
      sources: ['migrant'],
    });
    existingGovIds.add(m.governorId);
  }

  // Also insert inactives not in the scan
  if (inactives) {
    for (const row of inactives) {
      if (!row.governorId || existingGovIds.has(row.governorId)) continue;
      newFlaggedPlayers.push({
        scan_id: scanId,
        governor_id: row.governorId,
        name: row.name,
        power: 0,
        highest_power: 0,
        kill_points: 0,
        t4_kills: 0,
        t5_kills: 0,
        deaths: 0,
        current_alliance: '',
        migration_status: 'INACTIVE',
        is_migrant: false,
        migrant_accepted: false,
        migrant_group: null,
        migrant_recruiter: null,
        starting_kd: null,
        sources: ['migrant'],
      });
      existingGovIds.add(row.governorId);
    }
  }

  let inserted = 0;
  if (newFlaggedPlayers.length > 0) {
    for (let i = 0; i < newFlaggedPlayers.length; i += 500) {
      const batch = newFlaggedPlayers.slice(i, i + 500);
      const { error } = await supabase
        .from('kingdom_scan_players')
        .upsert(batch, { onConflict: 'scan_id,governor_id' });
      if (!error) inserted += batch.length;
    }
    if (inserted > 0) statusChanges += inserted;
  }

  return { updated: updates.length, statusChanges };
}

/**
 * Fetch all officer overrides for player reviews.
 */
export async function fetchPlayerOverrides(): Promise<Map<number, PlayerOverride>> {
  const map = new Map<number, PlayerOverride>();
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('kingdom_player_overrides')
      .select('*')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data) map.set(Number(row.governor_id), row as PlayerOverride);
    if (data.length < 1000) break;
    from += 1000;
  }
  return map;
}

/**
 * Upsert an officer override for a single player.
 */
export async function setPlayerOverride(
  governorId: number,
  status: OfficerStatus,
  note?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('kingdom_player_overrides')
    .upsert({
      governor_id: governorId,
      officer_status: status,
      officer_note: note ?? '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'governor_id' });
  return !error;
}

/**
 * Remove an officer override for a single player.
 */
export async function removePlayerOverride(governorId: number): Promise<boolean> {
  const { error } = await supabase
    .from('kingdom_player_overrides')
    .delete()
    .eq('governor_id', governorId);
  return !error;
}
