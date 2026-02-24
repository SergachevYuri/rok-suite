import type { RssNode, RssNodeType } from './rss-review';

// ─── Types ──────────────────────────────────────────────────────────

export interface SymmetryConfig {
  segments: number;
  centerX: number;
  centerY: number;
}

// ─── Geometry helpers ───────────────────────────────────────────────

/** Angle (0–2π) of a point relative to the center. 0 = right (+x). */
export function angleFromCenter(
  x: number,
  y: number,
  cx: number,
  cy: number,
): number {
  const dx = x - cx;
  const dy = y - cy;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += 2 * Math.PI;
  return angle;
}

/** Which segment (0-based) a point belongs to. */
export function getSegment(x: number, y: number, config: SymmetryConfig): number {
  const dist = Math.hypot(x - config.centerX, y - config.centerY);
  if (dist < 1) return 0; // center point → segment 0
  const angle = angleFromCenter(x, y, config.centerX, config.centerY);
  const segAngle = (2 * Math.PI) / config.segments;
  return Math.floor(angle / segAngle);
}

/** Rotate a point around the center by `angleRad` radians. */
export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angleRad: number,
): { x: number; y: number } {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: Math.round(cx + dx * cos - dy * sin),
    y: Math.round(cy + dx * sin + dy * cos),
  };
}

// ─── Propagation ────────────────────────────────────────────────────

/**
 * Rotate source nodes into all other segments.
 * Returns only the NEW propagated nodes (not the sources).
 */
export function propagateNodes(
  sourceNodes: RssNode[],
  config: SymmetryConfig,
  nextId: number,
): RssNode[] {
  const segAngle = (2 * Math.PI) / config.segments;
  const propagated: RssNode[] = [];
  let id = nextId;

  for (const node of sourceNodes) {
    for (let seg = 1; seg < config.segments; seg++) {
      const rotated = rotatePoint(node.x, node.y, config.centerX, config.centerY, seg * segAngle);
      propagated.push({
        id: id++,
        type: node.type,
        x: rotated.x,
        y: rotated.y,
        status: 'pending',
        source: 'propagated',
        segment: seg,
        sourceNodeId: node.id,
      });
    }
  }

  return propagated;
}

// ─── Segment boundary lines for rendering ───────────────────────────

/**
 * Returns line-segment pairs [[center, edge], ...] for each segment boundary.
 * Coordinates are in game-space (x, y) — the caller converts to Leaflet [y, x].
 */
export function getSegmentBoundaryLines(
  config: SymmetryConfig,
  mapSize: number,
): Array<[[number, number], [number, number]]> {
  const segAngle = (2 * Math.PI) / config.segments;
  const lineLen = mapSize * Math.SQRT2;
  const lines: Array<[[number, number], [number, number]]> = [];

  for (let i = 0; i < config.segments; i++) {
    const angle = i * segAngle;
    const endX = config.centerX + lineLen * Math.cos(angle);
    const endY = config.centerY + lineLen * Math.sin(angle);
    lines.push([
      [config.centerX, config.centerY],
      [endX, endY],
    ]);
  }

  return lines;
}

/**
 * Returns the polygon vertices for a single segment wedge (for highlight).
 * Coordinates are in game-space (x, y).
 */
export function getSegmentWedge(
  segmentIndex: number,
  config: SymmetryConfig,
  mapSize: number,
): [number, number][] {
  const segAngle = (2 * Math.PI) / config.segments;
  const lineLen = mapSize * Math.SQRT2;
  const startAngle = segmentIndex * segAngle;
  const endAngle = (segmentIndex + 1) * segAngle;

  // Arc approximation: center + two far points + a few intermediate arc points
  const points: [number, number][] = [[config.centerX, config.centerY]];
  const arcSteps = 8;
  for (let i = 0; i <= arcSteps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / arcSteps);
    points.push([
      config.centerX + lineLen * Math.cos(a),
      config.centerY + lineLen * Math.sin(a),
    ]);
  }
  return points;
}
