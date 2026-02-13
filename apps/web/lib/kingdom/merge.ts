import type { SnapshotRow, KingdomExportRow, MigrantRow, MergedPlayer, MigrationStatus } from './types';
import { cleanAllianceTag, normalizeName, isKingdomAlliance } from './config';

export function mergePlayers(
  snapshot: SnapshotRow[],
  kingdom: KingdomExportRow[],
  migrants: MigrantRow[],
  preMigration: KingdomExportRow[],
): MergedPlayer[] {
  const byId = new Map<number, MergedPlayer>();

  // 1. Index snapshot rows (primary source — freshest power)
  for (const row of snapshot) {
    byId.set(row.playerId, {
      governorId: row.playerId,
      name: row.playerName,
      power: row.playerPower,
      highestPower: 0,
      killPoints: row.playerKills,
      t4Kills: 0,
      t5Kills: 0,
      deaths: 0,
      gathered: 0,
      allianceHelps: 0,
      currentAlliance: cleanAllianceTag(row.playerAlliance),
      x: row.x,
      y: row.y,
      castleHall: row.playerCh || null,
      shieldTimeLeft: row.shieldTimeLeft || null,
      isMigrant: false,
      migrantAccepted: false,
      migrantGroup: null,
      migrantRecruiter: null,
      startingKd: null,
      existedPreMigration: false,
      migrationStatus: 'ILLEGAL', // default, will be overridden
      sources: ['snapshot'],
    });
  }

  // 2. Merge kingdom export by governorId
  for (const row of kingdom) {
    const existing = byId.get(row.governorId);
    if (existing) {
      existing.highestPower = row.highestPower;
      existing.killPoints = Math.max(existing.killPoints, row.totalKillPoints);
      existing.t4Kills = row.t4Kills;
      existing.t5Kills = row.t5Kills;
      existing.deaths = row.t1Deaths + row.t2Deaths + row.t3Deaths + row.t4Deaths + row.t5Deaths;
      existing.gathered = row.gathered;
      existing.allianceHelps = row.allianceHelps;
      existing.sources.push('kingdom');
    } else {
      byId.set(row.governorId, {
        governorId: row.governorId,
        name: row.name,
        power: row.power,
        highestPower: row.highestPower,
        killPoints: row.totalKillPoints,
        t4Kills: row.t4Kills,
        t5Kills: row.t5Kills,
        deaths: row.t1Deaths + row.t2Deaths + row.t3Deaths + row.t4Deaths + row.t5Deaths,
        gathered: row.gathered,
        allianceHelps: row.allianceHelps,
        currentAlliance: '',
        x: null,
        y: null,
        castleHall: null,
        shieldTimeLeft: null,
        isMigrant: false,
        migrantAccepted: false,
        migrantGroup: null,
        migrantRecruiter: null,
        startingKd: null,
        existedPreMigration: false,
        migrationStatus: 'ILLEGAL',
        sources: ['kingdom'],
      });
    }
  }

  // 3. Match migrants by governorId, fallback to normalized name
  const normalizedIndex = new Map<string, MergedPlayer>();
  for (const player of byId.values()) {
    const norm = normalizeName(player.name);
    if (norm) normalizedIndex.set(norm, player);
  }

  for (const migrant of migrants) {
    let target = migrant.governorId ? byId.get(migrant.governorId) : undefined;
    if (!target) {
      const norm = normalizeName(migrant.name);
      if (norm) target = normalizedIndex.get(norm);
    }
    if (target) {
      target.isMigrant = true;
      const acceptedVal = migrant.accepted.toLowerCase().trim();
      const illegalVal = migrant.illegalMigrant.toLowerCase().trim();
      target.migrantAccepted = acceptedVal === 'yes' || acceptedVal === 'y';

      // "Illegal Migrant" column = Yes → known illegal
      if (illegalVal === 'yes' || illegalVal === 'y') {
        target.migrationStatus = 'ILLEGAL';
      }
      // "Accepted" column = Yes → approved migrant
      else if (target.migrantAccepted) {
        target.migrationStatus = 'ACCEPTED';
      }
      // On the list but not accepted and not marked illegal → pending
      else {
        target.migrationStatus = 'PENDING';
      }

      target.migrantGroup = migrant.group || null;
      target.migrantRecruiter = migrant.recruiter || null;
      target.startingKd = migrant.startingKd || null;
      if (!target.sources.includes('migrant')) target.sources.push('migrant');
    }
    // Migrants not matched to snapshot/kingdom are not tracked (not in our kingdom yet)
  }

  // 4. Mark pre-migration members
  const preMigrationIds = new Set(preMigration.map(r => r.governorId));
  for (const player of byId.values()) {
    if (preMigrationIds.has(player.governorId)) {
      player.existedPreMigration = true;
      if (!player.sources.includes('preMigration')) player.sources.push('preMigration');
    }
  }

  // 5. Compute migration status
  for (const player of byId.values()) {
    player.migrationStatus = computeMigrationStatus(player, preMigration.length > 0);
  }

  return Array.from(byId.values());
}

function computeMigrationStatus(player: MergedPlayer, hasPreMigrationData: boolean): MigrationStatus {
  // If pre-migration data exists and player was in it → original resident
  if (hasPreMigrationData && player.existedPreMigration) {
    return 'ORIGINAL';
  }

  // If no pre-migration data uploaded, treat everyone without migrant flag as original
  if (!hasPreMigrationData && !player.isMigrant) {
    return 'ORIGINAL';
  }

  // Migrants: status was already set in the merge loop from Accepted + Illegal Migrant columns
  if (player.isMigrant) {
    return player.migrationStatus;
  }

  // Not on migrant list, not original → ILLEGAL
  if (hasPreMigrationData && !player.existedPreMigration) {
    return 'ILLEGAL';
  }

  return 'ORIGINAL';
}
