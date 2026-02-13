import type { MergedPlayer, AllianceConfig, PlayerAssignment, AssignmentStatus, ScanPlayer } from './types';
import { toSorterTag, formatNumber } from './config';

/**
 * Assign players to alliances based on power/KP thresholds.
 * Works with either MergedPlayer[] or ScanPlayer[] (Supabase data).
 */
export function assignAlliances(
  players: PlayerInput[],
  configs: AllianceConfig[],
): PlayerAssignment[] {
  const sortedConfigs = [...configs].sort((a, b) => a.rank - b.rank);
  const remaining = new Map<string, number>();
  for (const cfg of sortedConfigs) {
    remaining.set(cfg.tag, cfg.cap);
  }

  const assignments: PlayerAssignment[] = [];
  const assigned = new Set<number>();

  // Pass 1: Original kingdom members by power desc
  const originals = players
    .filter(p => isOriginal(p) && !isIllegalStatus(p))
    .sort((a, b) => getPower(b) - getPower(a));

  for (const player of originals) {
    const result = findBestAlliance(player, sortedConfigs, remaining);
    if (result) {
      assignments.push(result);
      assigned.add(getId(player));
      remaining.set(result.assignedAlliance, remaining.get(result.assignedAlliance)! - 1);
    }
  }

  // Pass 2: Accepted migrants by power desc
  const accepted = players
    .filter(p => isAcceptedMigrant(p) && !assigned.has(getId(p)))
    .sort((a, b) => getPower(b) - getPower(a));

  for (const player of accepted) {
    const result = findBestAlliance(player, sortedConfigs, remaining);
    if (result) {
      result.status = 'INCOMING';
      assignments.push(result);
      assigned.add(getId(player));
      remaining.set(result.assignedAlliance, remaining.get(result.assignedAlliance)! - 1);
    }
  }

  // Pass 3: Everyone else (not illegal, not already assigned)
  const others = players
    .filter(p => !assigned.has(getId(p)) && !isIllegalStatus(p))
    .sort((a, b) => getPower(b) - getPower(a));

  for (const player of others) {
    const result = findBestAlliance(player, sortedConfigs, remaining);
    if (result) {
      assignments.push(result);
      assigned.add(getId(player));
      remaining.set(result.assignedAlliance, remaining.get(result.assignedAlliance)! - 1);
    } else {
      assignments.push({
        governorId: getId(player),
        assignedAlliance: '',
        status: 'UNASSIGNED',
        reason: 'No available alliance slot',
      });
      assigned.add(getId(player));
    }
  }

  // Pass 4: Mark illegals
  const illegals = players.filter(p => isIllegalStatus(p) && !assigned.has(getId(p)));
  for (const player of illegals) {
    assignments.push({
      governorId: getId(player),
      assignedAlliance: '',
      status: 'ILLEGAL',
      reason: 'Illegal migrant — not on accepted list',
    });
  }

  return assignments;
}

function findBestAlliance(
  player: PlayerInput,
  configs: AllianceConfig[],
  remaining: Map<string, number>,
): PlayerAssignment | null {
  const power = getPower(player);
  const kp = getKp(player);

  for (const cfg of configs) {
    if ((remaining.get(cfg.tag) ?? 0) <= 0) continue;
    if (power < cfg.minPower) continue;

    // KP check: only enforce when player has KP data and config has a KP floor
    if (cfg.minKp !== null && kp > 0 && kp < cfg.minKp) {
      continue; // demote to next tier
    }

    const currentSorterTag = toSorterTag(getAlliance(player));
    const status: AssignmentStatus = currentSorterTag === cfg.tag ? 'STAY' : 'MOVE';

    const parts: string[] = [`Power ${formatNumber(power)} meets ${cfg.tag} floor ${formatNumber(cfg.minPower)}`];
    if (cfg.minKp !== null && kp > 0) {
      parts.push(`KP ${formatNumber(kp)} meets floor ${formatNumber(cfg.minKp)}`);
    }

    return {
      governorId: getId(player),
      assignedAlliance: cfg.tag,
      status,
      reason: parts.join('; '),
    };
  }
  return null;
}

// ─── Polymorphic helpers for MergedPlayer | ScanPlayer ──────────────

type PlayerInput = MergedPlayer | ScanPlayer;

function getId(p: PlayerInput): number {
  return 'governorId' in p ? p.governorId : p.governor_id;
}
function getPower(p: PlayerInput): number {
  return p.power;
}
function getKp(p: PlayerInput): number {
  return 'killPoints' in p ? p.killPoints : p.kill_points;
}
function getAlliance(p: PlayerInput): string {
  return 'currentAlliance' in p ? p.currentAlliance : p.current_alliance;
}
function isOriginal(p: PlayerInput): boolean {
  const status = 'migrationStatus' in p ? p.migrationStatus : p.migration_status;
  return status === 'ORIGINAL';
}
function isAcceptedMigrant(p: PlayerInput): boolean {
  const status = 'migrationStatus' in p ? p.migrationStatus : p.migration_status;
  return status === 'ACCEPTED';
}
function isIllegalStatus(p: PlayerInput): boolean {
  const status = 'migrationStatus' in p ? p.migrationStatus : p.migration_status;
  return status === 'ILLEGAL';
}
