// ─── Raw parsed rows from each data source ─────────────────────────

/** Davide snapshot CSV row */
export interface SnapshotRow {
  playerId: number;
  playerName: string;
  playerPower: number;
  playerKills: number;
  playerCh: number;
  playerAlliance: string;
  x: number;
  y: number;
  shieldTimeLeft: string;
}

/** Kingdom stats export XLSX row */
export interface KingdomExportRow {
  governorId: number;
  name: string;
  power: number;
  highestPower: number;
  t5Deaths: number;
  t4Deaths: number;
  t3Deaths: number;
  t2Deaths: number;
  t1Deaths: number;
  totalKillPoints: number;
  t5Kills: number;
  t4Kills: number;
  t3Kills: number;
  t2Kills: number;
  t1Kills: number;
  gathered: number;
  allianceHelps: number;
}

/** Google Sheet migrant list row */
export interface MigrantRow {
  name: string;
  governorId: number;
  power: number;
  killPoints: number;
  t4Kills: number;
  t5Kills: number;
  deads: number;
  startingKd: string;
  alliance: string;
  accepted: string;
  group: string;
  recruiter: string;
}

// ─── Merged / computed types ────────────────────────────────────────

export type MigrationStatus = 'ORIGINAL' | 'ACCEPTED' | 'PENDING' | 'ILLEGAL';
export type AssignmentStatus = 'STAY' | 'MOVE' | 'INCOMING' | 'ILLEGAL' | 'UNASSIGNED';
export type DataSource = 'snapshot' | 'kingdom' | 'migrant' | 'preMigration';

/** Unified player record merged from all sources */
export interface MergedPlayer {
  governorId: number;
  name: string;
  power: number;
  highestPower: number;
  killPoints: number;
  t4Kills: number;
  t5Kills: number;
  deaths: number;
  gathered: number;
  allianceHelps: number;
  currentAlliance: string;
  x: number | null;
  y: number | null;
  castleHall: number | null;
  shieldTimeLeft: string | null;

  // Migration tracking
  isMigrant: boolean;
  migrantAccepted: boolean;
  migrantGroup: string | null;
  migrantRecruiter: string | null;
  startingKd: string | null;
  existedPreMigration: boolean;
  migrationStatus: MigrationStatus;

  sources: DataSource[];
}

/** Editable alliance sort configuration */
export interface AllianceConfig {
  tag: string;
  rank: number;
  cap: number;
  minPower: number;
  minKp: number | null;
}

/** Result of the alliance assignment for one player */
export interface PlayerAssignment {
  governorId: number;
  assignedAlliance: string;
  status: AssignmentStatus;
  reason: string;
}

// ─── Supabase row types ─────────────────────────────────────────────

export interface Scan {
  id: number;
  created_at: string;
  label: string;
  snapshot_count: number;
  kingdom_count: number;
  migrant_count: number;
  pre_migration_count: number;
}

export interface ScanPlayer {
  id: number;
  scan_id: number;
  governor_id: number;
  name: string;
  power: number;
  highest_power: number;
  kill_points: number;
  t4_kills: number;
  t5_kills: number;
  deaths: number;
  gathered: number;
  alliance_helps: number;
  current_alliance: string;
  x: number | null;
  y: number | null;
  castle_hall: number | null;
  shield_time_left: string | null;
  migration_status: MigrationStatus;
  is_migrant: boolean;
  migrant_accepted: boolean;
  migrant_group: string | null;
  migrant_recruiter: string | null;
  starting_kd: string | null;
  existed_pre_migration: boolean;
  sources: DataSource[];
  assigned_alliance: string | null;
  assignment_status: AssignmentStatus | null;
  assignment_reason: string | null;
}
