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

  // Pass 0a: Exempt players (R4/R5) stay in their current alliance (skip flagged)
  if (exemptIds && exemptIds.size > 0) {
    for (const player of players) {
      if (!exemptIds.has(getId(player))) continue;
      if (isFlaggedStatus(player)) continue;
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

  // Pass 0b: Accepted migrants — pin to their assigned alliance
  for (const player of players) {
    if (assigned.has(getId(player))) continue;
    if (!isAcceptedMigrant(player)) continue;
    const currentTag = toSorterTag(getAlliance(player));
    if (remaining.has(currentTag) && (remaining.get(currentTag) ?? 0) > 0) {
      assignments.push({
        governorId: getId(player),
        assignedAlliance: currentTag,
        status: 'INCOMING',
        reason: 'Accepted migrant — assigned to ' + currentTag,
      });
      assigned.add(getId(player));
      remaining.set(currentTag, remaining.get(currentTag)! - 1);
    }
  }

  // Pass 1: Original kingdom members by power desc
  const originals = players
    .filter(p => isOriginal(p) && !assigned.has(getId(p)) && !isFlaggedStatus(p))
    .sort((a, b) => getPower(b) - getPower(a));

  for (const player of originals) {
    const result = findBestAlliance(player, sortedConfigs, remaining);
    if (result) {
      assignments.push(result);
      assigned.add(getId(player));
      remaining.set(result.assignedAlliance, remaining.get(result.assignedAlliance)! - 1);
    }
  }

  // Pass 2: Everyone else (not illegal, not already assigned)
  const others = players
    .filter(p => !assigned.has(getId(p)) && !isFlaggedStatus(p))
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

  // Pass 3: Mark flagged players (ILLEGAL/PENDING/INACTIVE) as unassigned
  const flagged = players.filter(p => isFlaggedStatus(p) && !assigned.has(getId(p)));
  for (const player of flagged) {
    const migStatus = 'migrationStatus' in player ? player.migrationStatus : player.migration_status;
    assignments.push({
      governorId: getId(player),
      assignedAlliance: '',
      status: 'ILLEGAL',
      reason: `Flagged — ${migStatus.toLowerCase()} in migration tracker`,
    });
  }

  return assignments;
}

function playerMeetsConfig(
  power: number,
  kp: number,
  cfg: AllianceConfig,
): { passed: boolean; checks: { passed: boolean; reason: string }[] } {
  if (power < cfg.minPower) return { passed: false, checks: [] };

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

  if (checks.length > 0) {
    const mode = cfg.thresholdMode || 'all';
    const pass = mode === 'any'
      ? checks.some(c => c.passed)
      : checks.every(c => c.passed);
    if (!pass) return { passed: false, checks };
  }

  return { passed: true, checks };
}

function makeAssignment(
  player: PlayerInput,
  cfg: AllianceConfig,
  checks: { passed: boolean; reason: string }[],
): PlayerAssignment {
  const power = getPower(player);
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

function findBestAlliance(
  player: PlayerInput,
  configs: AllianceConfig[],
  remaining: Map<string, number>,
): PlayerAssignment | null {
  const power = getPower(player);
  const kp = getKp(player);
  const currentSorterTag = toSorterTag(getAlliance(player));

  // Prefer staying in current alliance to minimize moves
  if (currentSorterTag) {
    const currentCfg = configs.find(c => c.tag === currentSorterTag);
    if (currentCfg && (remaining.get(currentCfg.tag) ?? 0) > 0) {
      const result = playerMeetsConfig(power, kp, currentCfg);
      if (result.passed) {
        return makeAssignment(player, currentCfg, result.checks);
      }
    }
  }

  // Fall back to best available alliance by rank
  for (const cfg of configs) {
    if ((remaining.get(cfg.tag) ?? 0) <= 0) continue;
    const result = playerMeetsConfig(power, kp, cfg);
    if (!result.passed) continue;
    return makeAssignment(player, cfg, result.checks);
  }
  return null;
}

/**
 * Suggest thresholds that fill alliances top-down by priority.
 * Pass 1: binary-search minPower per alliance (secondaries disabled).
 * Pass 2: binary-search minKp per alliance (power thresholds locked).
 * Maintains descending rank order for both power and KP.
 */
export function suggestThresholds(
  players: PlayerInput[],
  baseConfigs: AllianceConfig[],
  exemptIds?: Set<number>,
): AllianceConfig[] {
  const SLACK = 5;
  const POWER_STEP = 100_000;
  const KP_STEP = 100_000;
  const configs = baseConfigs.map(c => ({
    ...c,
    minKp: null as number | null,
    maxPowerKpRatio: null as number | null,
    thresholdMode: 'all' as const,
  }));
  const sorted = [...configs].sort((a, b) => a.rank - b.rank);

  // --- Pass 1: Find minPower per alliance (KP disabled) ---
  let prevMinPower = 80_000_000;

  for (const cfg of sorted) {
    const idx = configs.findIndex(c => c.tag === cfg.tag);
    const target = cfg.cap - SLACK;

    let low = 0;
    let high = prevMinPower;

    for (let iter = 0; iter < 30; iter++) {
      const mid = Math.round((low + high) / 2 / POWER_STEP) * POWER_STEP;
      configs[idx].minPower = mid;

      const result = assignAlliances(players, configs, exemptIds);
      const fill = result.filter(a => a.assignedAlliance === cfg.tag).length;

      if (fill < target) {
        high = mid;
      } else {
        low = mid;
      }
    }

    // Pick whichever of low/high gets fill closer to target (~cap-5).
    configs[idx].minPower = low;
    const fillAtLow = assignAlliances(players, configs, exemptIds)
      .filter(a => a.assignedAlliance === cfg.tag).length;
    configs[idx].minPower = high;
    const fillAtHigh = assignAlliances(players, configs, exemptIds)
      .filter(a => a.assignedAlliance === cfg.tag).length;

    const diffLow = Math.abs(fillAtLow - target);
    const diffHigh = Math.abs(fillAtHigh - target);
    const useHigh = diffHigh < diffLow || (diffHigh === diffLow) || fillAtLow >= cfg.cap;
    const finalPower = useHigh ? high : low;

    configs[idx].minPower = finalPower;
    prevMinPower = finalPower;
  }

  // --- Pass 2: Find minKp per alliance (power thresholds locked) ---
  // Binary-search the highest minKp that still keeps the alliance filled.
  let prevMinKp = 50_000_000;

  for (const cfg of sorted) {
    const idx = configs.findIndex(c => c.tag === cfg.tag);

    // Get current fill without any KP filter to know the baseline
    const baseResult = assignAlliances(players, configs, exemptIds);
    const baseFill = baseResult.filter(a => a.assignedAlliance === cfg.tag).length;

    // Target: don't lose more than SLACK players from the power-only fill
    const kpTarget = Math.max(baseFill - SLACK, cfg.cap - SLACK * 2);

    let low = 0;
    let high = prevMinKp;

    for (let iter = 0; iter < 30; iter++) {
      const mid = Math.round((low + high) / 2 / KP_STEP) * KP_STEP;
      configs[idx].minKp = mid;

      const result = assignAlliances(players, configs, exemptIds);
      const fill = result.filter(a => a.assignedAlliance === cfg.tag).length;

      if (fill < kpTarget) {
        high = mid;  // KP too high, fewer players qualify
      } else {
        low = mid;   // Can raise KP, still enough players
      }
    }

    // Same logic: pick closest to target, prefer higher KP
    configs[idx].minKp = low;
    const kpFillAtLow = assignAlliances(players, configs, exemptIds)
      .filter(a => a.assignedAlliance === cfg.tag).length;
    configs[idx].minKp = high;
    const kpFillAtHigh = assignAlliances(players, configs, exemptIds)
      .filter(a => a.assignedAlliance === cfg.tag).length;

    const kpDiffLow = Math.abs(kpFillAtLow - kpTarget);
    const kpDiffHigh = Math.abs(kpFillAtHigh - kpTarget);
    const kpUseHigh = kpDiffHigh < kpDiffLow || (kpDiffHigh === kpDiffLow) || kpFillAtLow >= cfg.cap;
    const finalKp = kpUseHigh ? high : low;

    // Only apply KP threshold if it's meaningful (> 0)
    configs[idx].minKp = finalKp > 0 ? finalKp : null;
    if (finalKp > 0) prevMinKp = finalKp;
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
/** Players with these migration statuses are excluded from sorting entirely */
const FLAGGED_STATUSES = new Set(['ILLEGAL', 'PENDING', 'INACTIVE']);

function isFlaggedStatus(p: PlayerInput): boolean {
  const status = 'migrationStatus' in p ? p.migrationStatus : p.migration_status;
  return FLAGGED_STATUSES.has(status);
}
