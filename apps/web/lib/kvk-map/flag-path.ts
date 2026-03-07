import type { RssNode, RssNodeType } from './rss-review';

// ── Constants ──────────────────────────────────────────────────────

export const RSS_EARNINGS_PER_HOUR: Record<RssNodeType, number> = {
  gold: 1000,
  stone: 1500,
  crystal: 500,
  wood: 2000,
  food: 2000,
};

export const FLAG_TILE_SIZE = 9;
export const FLAG_HALF = FLAG_TILE_SIZE / 2; // 4.5
export const DEFAULT_FLAG_STEP = 8;
export const DEFAULT_MAX_DEVIATION = 6;
const DEVIATION_PENALTY = 50; // RSS/h cost per tile of deviation from baseline

// ── Types ──────────────────────────────────────────────────────────

export interface Waypoint {
  id: string;
  x: number;
  y: number;
}

export type PlannedFlagStatus = 'planned' | 'existing';

export interface PlannedFlag {
  id: string;
  x: number;
  y: number;
  status: PlannedFlagStatus;
  coveredNodeIds: number[];
  rssPerHour: number;
}

export interface FlagPathConfig {
  flagStep: number;
  maxDeviation: number;
}

export interface FlagPathResult {
  flags: PlannedFlag[];
  coveredNodes: Set<number>;
  totalRssPerHour: number;
  rssBreakdown: Record<RssNodeType, { count: number; rssPerHour: number }>;
}

// ── Spatial Index ──────────────────────────────────────────────────

type SpatialIndex = Map<string, RssNode[]>;

function cellKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

function buildSpatialIndex(nodes: RssNode[], cellSize: number = 10): SpatialIndex {
  const index: SpatialIndex = new Map();
  for (const n of nodes) {
    const key = cellKey(n.x, n.y, cellSize);
    const arr = index.get(key);
    if (arr) arr.push(n);
    else index.set(key, [n]);
  }
  return index;
}

function queryNodesNear(
  cx: number,
  cy: number,
  half: number,
  index: SpatialIndex,
  cellSize: number = 10,
): RssNode[] {
  const result: RssNode[] = [];
  const minCellX = Math.floor((cx - half) / cellSize);
  const maxCellX = Math.floor((cx + half) / cellSize);
  const minCellY = Math.floor((cy - half) / cellSize);
  const maxCellY = Math.floor((cy + half) / cellSize);
  for (let gx = minCellX; gx <= maxCellX; gx++) {
    for (let gy = minCellY; gy <= maxCellY; gy++) {
      const nodes = index.get(`${gx},${gy}`);
      if (!nodes) continue;
      for (const n of nodes) {
        if (Math.abs(n.x - cx) <= half && Math.abs(n.y - cy) <= half) {
          result.push(n);
        }
      }
    }
  }
  return result;
}

// ── Path Interpolation ─────────────────────────────────────────────

function interpolatePath(waypoints: Waypoint[]): { x: number; y: number }[] {
  if (waypoints.length < 2) return waypoints.map((w) => ({ x: w.x, y: w.y }));
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      points.push({ x: a.x, y: a.y });
      continue;
    }
    const steps = Math.ceil(len);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      points.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return points;
}

// ── Baseline Flag Placement ────────────────────────────────────────

function placeFlagsAlongPath(
  pathPoints: { x: number; y: number }[],
  flagStep: number,
): { x: number; y: number }[] {
  if (pathPoints.length === 0) return [];
  const flags: { x: number; y: number }[] = [{ x: Math.round(pathPoints[0].x), y: Math.round(pathPoints[0].y) }];
  let accumulated = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    const dx = pathPoints[i].x - pathPoints[i - 1].x;
    const dy = pathPoints[i].y - pathPoints[i - 1].y;
    accumulated += Math.hypot(dx, dy);
    if (accumulated >= flagStep) {
      flags.push({ x: Math.round(pathPoints[i].x), y: Math.round(pathPoints[i].y) });
      accumulated = 0;
    }
  }
  // Ensure end point is included
  const last = pathPoints[pathPoints.length - 1];
  const lastFlag = flags[flags.length - 1];
  if (Math.hypot(last.x - lastFlag.x, last.y - lastFlag.y) > 1) {
    flags.push({ x: Math.round(last.x), y: Math.round(last.y) });
  }
  return flags;
}

// ── Candidate Generation & Scoring ─────────────────────────────────

function generateCandidates(
  baseX: number,
  baseY: number,
  maxDev: number,
): { x: number; y: number }[] {
  const candidates: { x: number; y: number }[] = [];
  for (let dx = -maxDev; dx <= maxDev; dx++) {
    for (let dy = -maxDev; dy <= maxDev; dy++) {
      if (dx * dx + dy * dy <= (maxDev + 0.5) * (maxDev + 0.5)) {
        candidates.push({ x: Math.round(baseX + dx), y: Math.round(baseY + dy) });
      }
    }
  }
  return candidates;
}

function scoreCandidate(
  cx: number,
  cy: number,
  baseX: number,
  baseY: number,
  spatialIndex: SpatialIndex,
  alreadyCovered: Set<number>,
): number {
  const covered = queryNodesNear(cx, cy, FLAG_HALF, spatialIndex);
  let rssScore = 0;
  for (const n of covered) {
    if (!alreadyCovered.has(n.id)) {
      rssScore += RSS_EARNINGS_PER_HOUR[n.type];
    }
  }
  const deviation = Math.hypot(cx - baseX, cy - baseY);
  return rssScore - deviation * DEVIATION_PENALTY;
}

// ── Main Algorithm ─────────────────────────────────────────────────

/** Check Chebyshev connectivity between two flags */
function isConnected(ax: number, ay: number, bx: number, by: number, maxDist: number): boolean {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= maxDist;
}

/** Run one greedy pass: for each flag position, pick the best candidate */
function greedyPass(
  baselineFlags: { x: number; y: number }[],
  positions: { x: number; y: number }[],
  config: FlagPathConfig,
  spatialIndex: SpatialIndex,
): { x: number; y: number }[] {
  const maxConnDist = config.flagStep + 2; // slightly relaxed for better RSS seeking
  const result: { x: number; y: number }[] = [];
  const covered = new Set<number>();

  for (let i = 0; i < baselineFlags.length; i++) {
    const base = baselineFlags[i];
    const candidates = config.maxDeviation > 0
      ? generateCandidates(base.x, base.y, config.maxDeviation)
      : [{ x: base.x, y: base.y }];

    let bestX = positions[i]?.x ?? base.x;
    let bestY = positions[i]?.y ?? base.y;
    let bestScore = -Infinity;

    for (const c of candidates) {
      // Must connect to previous placed flag
      if (i > 0 && !isConnected(c.x, c.y, result[i - 1].x, result[i - 1].y, maxConnDist)) {
        continue;
      }
      const score = scoreCandidate(c.x, c.y, base.x, base.y, spatialIndex, covered);
      if (score > bestScore || (score === bestScore && Math.hypot(c.x - base.x, c.y - base.y) < Math.hypot(bestX - base.x, bestY - base.y))) {
        bestScore = score;
        bestX = c.x;
        bestY = c.y;
      }
    }

    // Track coverage
    const nodes = queryNodesNear(bestX, bestY, FLAG_HALF, spatialIndex);
    for (const n of nodes) covered.add(n.id);

    result.push({ x: bestX, y: bestY });
  }

  return result;
}

/** Refinement pass: re-optimize each flag considering both neighbors */
function refinePass(
  baselineFlags: { x: number; y: number }[],
  positions: { x: number; y: number }[],
  config: FlagPathConfig,
  spatialIndex: SpatialIndex,
): { x: number; y: number }[] {
  const maxConnDist = config.flagStep + 2;
  const result = positions.map((p) => ({ ...p }));

  // Rebuild coverage excluding current flag, then pick best for it
  for (let i = 0; i < result.length; i++) {
    const covered = new Set<number>();
    // Collect coverage from all OTHER flags
    for (let j = 0; j < result.length; j++) {
      if (j === i) continue;
      const nodes = queryNodesNear(result[j].x, result[j].y, FLAG_HALF, spatialIndex);
      for (const n of nodes) covered.add(n.id);
    }

    const base = baselineFlags[i];
    const candidates = config.maxDeviation > 0
      ? generateCandidates(base.x, base.y, config.maxDeviation)
      : [{ x: base.x, y: base.y }];

    let bestX = result[i].x;
    let bestY = result[i].y;
    let bestScore = -Infinity;

    for (const c of candidates) {
      // Must connect to both neighbors
      if (i > 0 && !isConnected(c.x, c.y, result[i - 1].x, result[i - 1].y, maxConnDist)) continue;
      if (i < result.length - 1 && !isConnected(c.x, c.y, result[i + 1].x, result[i + 1].y, maxConnDist)) continue;

      const score = scoreCandidate(c.x, c.y, base.x, base.y, spatialIndex, covered);
      if (score > bestScore || (score === bestScore && Math.hypot(c.x - base.x, c.y - base.y) < Math.hypot(bestX - base.x, bestY - base.y))) {
        bestScore = score;
        bestX = c.x;
        bestY = c.y;
      }
    }

    result[i] = { x: bestX, y: bestY };
  }

  return result;
}

export function computeFlagPath(
  waypoints: Waypoint[],
  rssNodes: RssNode[],
  config: FlagPathConfig = { flagStep: DEFAULT_FLAG_STEP, maxDeviation: DEFAULT_MAX_DEVIATION },
): FlagPathResult {
  const eligible = rssNodes.filter((n) => n.status === 'approved');
  const spatialIndex = buildSpatialIndex(eligible);
  const pathPoints = interpolatePath(waypoints);
  const baselineFlags = placeFlagsAlongPath(pathPoints, config.flagStep);

  if (baselineFlags.length === 0) {
    return buildResult([], new Set(), eligible);
  }

  // Initial greedy pass
  let positions = greedyPass(baselineFlags, baselineFlags, config, spatialIndex);

  // Refinement passes — re-optimize each flag considering both neighbors
  const REFINE_PASSES = 3;
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    positions = refinePass(baselineFlags, positions, config, spatialIndex);
  }

  // Build final flags with coverage
  const alreadyCovered = new Set<number>();
  const flags: PlannedFlag[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const covered = queryNodesNear(pos.x, pos.y, FLAG_HALF, spatialIndex);
    const newCoveredIds: number[] = [];
    let flagRss = 0;
    for (const n of covered) {
      if (!alreadyCovered.has(n.id)) {
        newCoveredIds.push(n.id);
        alreadyCovered.add(n.id);
        flagRss += RSS_EARNINGS_PER_HOUR[n.type];
      }
    }

    flags.push({
      id: crypto.randomUUID(),
      x: pos.x,
      y: pos.y,
      status: 'planned',
      coveredNodeIds: newCoveredIds,
      rssPerHour: flagRss,
    });
  }

  return buildResult(flags, alreadyCovered, eligible);
}

// ── Recalculate after manual changes ───────────────────────────────

export function recalculateCoverage(
  flags: PlannedFlag[],
  rssNodes: RssNode[],
): FlagPathResult {
  const eligible = rssNodes.filter((n) => n.status === 'approved');
  const spatialIndex = buildSpatialIndex(eligible);
  const allCovered = new Set<number>();

  const updatedFlags = flags.map((f) => {
    const covered = queryNodesNear(f.x, f.y, FLAG_HALF, spatialIndex);
    const newIds: number[] = [];
    let rss = 0;
    for (const n of covered) {
      if (!allCovered.has(n.id)) {
        newIds.push(n.id);
        allCovered.add(n.id);
        rss += RSS_EARNINGS_PER_HOUR[n.type];
      }
    }
    return { ...f, coveredNodeIds: newIds, rssPerHour: rss };
  });

  return buildResult(updatedFlags, allCovered, eligible);
}

// ── Result Builder ─────────────────────────────────────────────────

function buildResult(
  flags: PlannedFlag[],
  coveredNodes: Set<number>,
  allNodes: RssNode[],
): FlagPathResult {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const breakdown: Record<RssNodeType, { count: number; rssPerHour: number }> = {
    food: { count: 0, rssPerHour: 0 },
    wood: { count: 0, rssPerHour: 0 },
    stone: { count: 0, rssPerHour: 0 },
    gold: { count: 0, rssPerHour: 0 },
    crystal: { count: 0, rssPerHour: 0 },
  };

  let total = 0;
  for (const id of coveredNodes) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const earn = RSS_EARNINGS_PER_HOUR[node.type];
    breakdown[node.type].count++;
    breakdown[node.type].rssPerHour += earn;
    total += earn;
  }

  return { flags, coveredNodes, totalRssPerHour: total, rssBreakdown: breakdown };
}
