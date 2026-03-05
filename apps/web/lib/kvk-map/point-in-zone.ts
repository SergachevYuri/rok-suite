import type { KvkMapZone } from '@/lib/kvk-map-types';

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (x, y) is inside the given polygon.
 * Polygon is an array of [x, y] vertices (closed automatically).
 */
export function isPointInPolygon(
  x: number,
  y: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Find the first zone whose polygon contains the given point.
 */
export function findZoneForPoint(
  x: number,
  y: number,
  zones: KvkMapZone[],
): KvkMapZone | null {
  for (const zone of zones) {
    if (isPointInPolygon(x, y, zone.polygon)) return zone;
  }
  return null;
}
