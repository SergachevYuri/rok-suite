import { GAME_MAP_SIZE } from '@/lib/kvk-map-types';
import type { RssNodeType } from '@/lib/kvk-map/rss-review';

interface DetectedPixelNode {
  x: number; // game coords
  y: number;
  type: RssNodeType;
}

interface AnnotationSample {
  x: number; // game coords
  y: number;
  type: RssNodeType;
}

/**
 * Detect RSS nodes by scanning the map image for bright non-terrain pixels.
 * Uses manual annotations as color references to classify detected nodes.
 *
 * Runs entirely client-side — no API calls needed.
 */
export async function detectNodesPixel(
  imageUrl: string,
  annotations: AnnotationSample[],
  onProgress?: (msg: string) => void,
): Promise<DetectedPixelNode[]> {
  onProgress?.('Loading map image...');
  const img = await loadImage(imageUrl);
  const w = img.width;
  const h = img.height;

  // Draw to canvas to get pixel data
  onProgress?.('Reading pixel data...');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  // Step 1: Sample colors around each manual annotation to build type color profiles
  onProgress?.('Building color profiles from annotations...');
  const typeColors: Record<RssNodeType, number[][]> = {
    food: [], wood: [], stone: [], gold: [], crystal: [],
  };

  const SAMPLE_RADIUS = 12; // pixels around annotation center to sample
  for (const ann of annotations) {
    const px = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const py = Math.round((ann.y / GAME_MAP_SIZE) * h);

    // Collect bright pixels near this annotation
    for (let dy = -SAMPLE_RADIUS; dy <= SAMPLE_RADIUS; dy++) {
      for (let dx = -SAMPLE_RADIUS; dx <= SAMPLE_RADIUS; dx++) {
        const sx = px + dx;
        const sy = py + dy;
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
        if (dx * dx + dy * dy > SAMPLE_RADIUS * SAMPLE_RADIUS) continue;

        const idx = (sy * w + sx) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        // Only sample pixels that are bright (not terrain green or dark walls)
        if (isBrightNonTerrain(r, g, b)) {
          typeColors[ann.type].push([r, g, b]);
        }
      }
    }
  }

  // Compute average color per type
  const typeAvgColors: Record<string, [number, number, number]> = {};
  for (const type of Object.keys(typeColors) as RssNodeType[]) {
    const samples = typeColors[type];
    if (samples.length === 0) continue;
    const avg: [number, number, number] = [0, 0, 0];
    for (const [r, g, b] of samples) {
      avg[0] += r;
      avg[1] += g;
      avg[2] += b;
    }
    avg[0] = Math.round(avg[0] / samples.length);
    avg[1] = Math.round(avg[1] / samples.length);
    avg[2] = Math.round(avg[2] / samples.length);
    typeAvgColors[type] = avg;
  }

  // Step 2: Scan entire image for bright non-terrain pixels
  onProgress?.('Scanning for nodes...');
  const STEP = 2; // scan every 2nd pixel for speed
  const brightPoints: { px: number; py: number; r: number; g: number; b: number }[] = [];

  for (let y = 0; y < h; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      const idx = (y * w + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      if (isBrightNonTerrain(r, g, b)) {
        brightPoints.push({ px: x, py: y, r, g, b });
      }
    }

    // Progress every 500 rows
    if (y % 500 === 0) {
      onProgress?.(`Scanning... ${Math.round((y / h) * 100)}%`);
      // Yield to UI thread
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(`Found ${brightPoints.length} bright pixels, clustering...`);

  // Step 3: Cluster nearby bright points (DBSCAN-like approach)
  const CLUSTER_DIST = 15; // pixels — nodes are ~20-40px diameter
  const visited = new Set<number>();
  const clusters: { px: number; py: number; r: number; g: number; b: number }[][] = [];

  for (let i = 0; i < brightPoints.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    const cluster = [brightPoints[i]];
    const queue = [i];

    while (queue.length > 0) {
      const ci = queue.pop()!;
      const cp = brightPoints[ci];

      for (let j = i + 1; j < brightPoints.length; j++) {
        if (visited.has(j)) continue;
        const jp = brightPoints[j];
        const dist = Math.hypot(cp.px - jp.px, cp.py - jp.py);
        if (dist <= CLUSTER_DIST) {
          visited.add(j);
          cluster.push(jp);
          queue.push(j);
        }
      }
    }

    // Minimum cluster size to count as a node (filter noise)
    if (cluster.length >= 3) {
      clusters.push(cluster);
    }
  }

  onProgress?.(`Found ${clusters.length} clusters, classifying...`);

  // Step 4: For each cluster, compute centroid and classify by closest type color
  const detectedNodes: DetectedPixelNode[] = [];
  const availableTypes = Object.keys(typeAvgColors) as RssNodeType[];

  for (const cluster of clusters) {
    // Centroid
    let cx = 0, cy = 0, cr = 0, cg = 0, cb = 0;
    for (const p of cluster) {
      cx += p.px;
      cy += p.py;
      cr += p.r;
      cg += p.g;
      cb += p.b;
    }
    cx /= cluster.length;
    cy /= cluster.length;
    cr /= cluster.length;
    cg /= cluster.length;
    cb /= cluster.length;

    // Convert pixel coords to game coords
    const gameX = Math.round((cx / w) * GAME_MAP_SIZE);
    const gameY = Math.round((cy / h) * GAME_MAP_SIZE);

    // Classify by closest type color
    let bestType: RssNodeType = 'food';
    let bestDist = Infinity;
    for (const type of availableTypes) {
      const [ar, ag, ab] = typeAvgColors[type];
      const dist = Math.hypot(cr - ar, cg - ag, cb - ab);
      if (dist < bestDist) {
        bestDist = dist;
        bestType = type;
      }
    }

    detectedNodes.push({ x: gameX, y: gameY, type: bestType });
  }

  onProgress?.(`Detected ${detectedNodes.length} nodes`);
  return detectedNodes;
}

/**
 * Check if a pixel is a "bright non-terrain" pixel.
 * The map terrain is mostly yellow-green (#9BA030-ish) and dark walls are near black.
 * Node icons are brighter/more saturated and stand out from the terrain.
 */
function isBrightNonTerrain(r: number, g: number, b: number): boolean {
  const brightness = (r + g + b) / 3;

  // Too dark = terrain walls or borders
  if (brightness < 60) return false;

  // Check if it's the dominant green terrain color
  // Terrain is roughly: R=130-190, G=150-200, B=40-100 (yellow-green)
  const isGreenTerrain =
    g > r * 0.7 && g > b * 1.3 &&
    r > 80 && r < 210 &&
    g > 100 && g < 220 &&
    b < 130;

  if (isGreenTerrain) return false;

  // Grayish-green terrain (borders of tiles, paths)
  const isGrayGreen =
    Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && brightness < 160;
  if (isGrayGreen) return false;

  // Must be reasonably bright to be a node icon
  if (brightness < 100) return false;

  return true;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
