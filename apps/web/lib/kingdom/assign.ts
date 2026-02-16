import type { MergedPlayer, AllianceConfig, PlayerAssignment, AssignmentStatus, ScanPlayer } from './types';
import { toSorterTag, formatNumber } from './config';

/**
 * Assign players to alliances based on power/KP thresholds.
 * Works with either MergedPlayer[] or ScanPlayer[] (Supabase data).
 */
export function assignAlliances(
  players: PlayerInput[],
  configs: AllianceConfig[],
  exemptIds?: Set<number>,
): PlayerAssignment[] {
  const sortedConfigs = [...configs].sort((a, b) => a.rank - b.rank);
  const remaining = new Map<string, number>();
  for (const cfg of sortedConfigs) {
    remaining.set(cfg.tag, cfg.cap);
  }

  const assignments: PlayerAssignment[] = [];
  const assigned = new Set<number>();

  // Pass 0: Exempt players (R4/R5) stay in their current alliance
  if (exemptIds && exemptIds.size > 0) {
    for (const player of players) {
      if (!exemptIds.has(getId(player))) continue;
      const currentTag = toSorterTag(getAlliance(player));
      if (remaining.has(currentTag) && (remaining.get(currentTag) ?? 0) > 0) {
        assignments.push({
          governorId: getId(player),
          assignedAlliance: currentTag,
          status: 'STAY',
          reason: 'R4/R5 — exempt from sorting',
        });
        assigned.add(getId(player));
        remaining.set(currentTag, remaining.get(currentTag)! - 1);
      }
    }
  }

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

    // Evaluate secondary criteria (KP and ratio)
    const checks: { passed: boolean; reason: string }[] = [];

    if (cfg.minKp !== null && kp > 0) {
      checks.push({
        passed: kp >= cfg.minKp,
        reason: `KP ${formatNumber(kp)} ${kp >= cfg.minKp ? '≥' : '<'} floor ${formatNumber(cfg.minKp)}`,
      });
    }

    if (cfg.maxPowerKpRatio !== null && kp > 0) {
      const ratio = power / kp;
      checks.push({
        passed: ratio <= cfg.maxPowerKpRatio,
        reason: `P:KP ${ratio.toFixed(1)} ${ratio <= cfg.maxPowerKpRatio ? '≤' : '>'} ${cfg.maxPowerKpRatio}`,
      });
    }

    // Apply threshold mode: 'all' = every check must pass, 'any' = at least one
    if (checks.length > 0) {
      const mode = cfg.thresholdMode || 'all';
      const pass = mode === 'any'
        ? checks.some(c => c.passed)
        : checks.every(c => c.passed);
      if (!pass) continue;
    }

    const currentSorterTag = toSorterTag(getAlliance(player));
    const status: AssignmentStatus = currentSorterTag === cfg.tag ? 'STAY' : 'MOVE';

    const parts: string[] = [`Power ${formatNumber(power)} meets ${cfg.tag} floor ${formatNumber(cfg.minPower)}`];
    for (const c of checks) {
      if (c.passed) parts.push(c.reason);
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

/**
 * Suggest thresholds that fill each alliance close to its cap
 * while maintaining rank order (higher-ranked alliances get higher thresholds).
 * Allows up to 5 open spots per alliance.
 *
 * Adjusts in order: minPower first, then minKp, then maxPowerKpRatio.
 */
export function suggestThresholds(
  players: PlayerInput[],
  baseConfigs: AllianceConfig[],
  exemptIds?: Set<number>,
): AllianceConfig[] {
  const SLACK = 5;
  const configs = baseConfigs.map(c => ({ ...c }));
  const sorted = [...configs].sort((a, b) => a.rank - b.rank);

  let prevMinPower = 80_000_000;

  for (const cfg of sorted) {
    const idx = configs.findIndex(c => c.tag === cfg.tag);
    const target = cfg.cap - SLACK;

    // Helper: run sorter and count fill for this alliance
    const getFill = () => {
      const result = assignAlliances(players, configs, exemptIds);
      return result.filter(a => a.assignedAlliance === cfg.tag).length;
    };

    // Step 1: Binary search minPower
    let low = 0;
    let high = prevMinPower;
    for (let iter = 0; iter < 20; iter++) {
      const mid = Math.round((low + high) / 2 / 1_000_000) * 1_000_000;
      configs[idx].minPower = mid;
      if (getFill() < target) {
        high = mid;
      } else {
        low = mid;
      }
    }
    configs[idx].minPower = Math.round((low + high) / 2 / 1_000_000) * 1_000_000;

    // Step 2: If still underfilled and minKp is enabled, binary search it downward
    if (configs[idx].minKp !== null && getFill() < target) {
      const origKp = configs[idx].minKp!;
      low = 0;
      high = origKp;
      for (let iter = 0; iter < 15; iter++) {
        const mid = Math.round((low + high) / 2 / 500_000) * 500_000;
        configs[idx].minKp = mid || null;
        if (getFill() < target) {
          high = mid;
        } else {
          low = mid;
        }
      }
      const finalKp = Math.round((low + high) / 2 / 500_000) * 500_000;
      configs[idx].minKp = finalKp || null;
    }

    // Step 3: If still underfilled and maxPowerKpRatio is enabled, binary search it upward
    if (configs[idx].maxPowerKpRatio !== null && getFill() < target) {
      const origRatio = configs[idx].maxPowerKpRatio!;
      low = origRatio;
      high = 5;
      for (let iter = 0; iter < 15; iter++) {
        const mid = Math.round((low + high) * 5) / 10;
        configs[idx].maxPowerKpRatio = mid;
        if (getFill() < target) {
          low = mid;
        } else {
          high = mid;
        }
      }
      configs[idx].maxPowerKpRatio = Math.round((low + high) * 5) / 10;
    }

    // Step 4: If STILL underfilled, disable secondary criteria entirely
    if (getFill() < target) {
      configs[idx].minKp = null;
      configs[idx].maxPowerKpRatio = null;
    }

    prevMinPower = configs[idx].minPower;
  }

  return configs;
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
