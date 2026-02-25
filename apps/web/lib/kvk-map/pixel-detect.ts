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

  const SAMPLE_RADIUS = 12;
  for (const ann of annotations) {
    const px = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const py = Math.round((ann.y / GAME_MAP_SIZE) * h);

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

  // Step 2: Grid-based density scan
  // Divide the image into cells. Count bright pixels per cell.
  // Cells with enough bright pixels are node candidates.
  const CELL_SIZE = 20; // pixels per grid cell (nodes are ~20-40px)
  const gridW = Math.ceil(w / CELL_SIZE);
  const gridH = Math.ceil(h / CELL_SIZE);
  const cellCounts = new Uint16Array(gridW * gridH);
  const cellColorR = new Float32Array(gridW * gridH);
  const cellColorG = new Float32Array(gridW * gridH);
  const cellColorB = new Float32Array(gridW * gridH);

  onProgress?.('Scanning for nodes...');
  const STEP = 3; // scan every 3rd pixel for speed

  for (let y = 0; y < h; y += STEP) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x += STEP) {
      const idx = (rowOffset + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      if (isBrightNonTerrain(r, g, b)) {
        const gx = Math.floor(x / CELL_SIZE);
        const gy = Math.floor(y / CELL_SIZE);
        const ci = gy * gridW + gx;
        cellCounts[ci]++;
        cellColorR[ci] += r;
        cellColorG[ci] += g;
        cellColorB[ci] += b;
      }
    }

    if (y % 1000 === 0) {
      onProgress?.(`Scanning... ${Math.round((y / h) * 100)}%`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Step 3: Find dense cells and flood-fill connected components
  onProgress?.('Clustering...');
  const MIN_CELL_COUNT = 3; // minimum bright pixels in a cell to be a candidate
  const visited = new Uint8Array(gridW * gridH);

  const clusters: { cx: number; cy: number; cr: number; cg: number; cb: number; total: number }[] = [];

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const ci = gy * gridW + gx;
      if (visited[ci] || cellCounts[ci] < MIN_CELL_COUNT) continue;

      // Flood fill to find connected dense cells
      visited[ci] = 1;
      const queue = [{ gx, gy }];
      let totalCount = 0;
      let sumX = 0, sumY = 0;
      let sumR = 0, sumG = 0, sumB = 0;

      while (queue.length > 0) {
        const cell = queue.pop()!;
        const idx = cell.gy * gridW + cell.gx;
        const count = cellCounts[idx];
        totalCount += count;
        // Weight position by pixel count in cell
        sumX += (cell.gx * CELL_SIZE + CELL_SIZE / 2) * count;
        sumY += (cell.gy * CELL_SIZE + CELL_SIZE / 2) * count;
        sumR += cellColorR[idx];
        sumG += cellColorG[idx];
        sumB += cellColorB[idx];

        // Check 4-connected neighbors
        for (const [nx, ny] of [[cell.gx - 1, cell.gy], [cell.gx + 1, cell.gy], [cell.gx, cell.gy - 1], [cell.gx, cell.gy + 1]]) {
          if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
          const ni = ny * gridW + nx;
          if (visited[ni] || cellCounts[ni] < MIN_CELL_COUNT) continue;
          visited[ni] = 1;
          queue.push({ gx: nx, gy: ny });
        }
      }

      // Filter: clusters that are too large are probably terrain features, not nodes
      // Node icons are ~20-40px, so a cluster shouldn't span more than ~4 cells
      const clusterCells = totalCount / MIN_CELL_COUNT; // rough cell count
      if (clusterCells > 30) continue; // way too big

      const cx = sumX / totalCount;
      const cy = sumY / totalCount;
      const cr = sumR / totalCount;
      const cg = sumG / totalCount;
      const cb = sumB / totalCount;

      clusters.push({ cx, cy, cr, cg, cb, total: totalCount });
    }
  }

  onProgress?.(`Found ${clusters.length} candidates, classifying...`);

  // Step 4: Classify each cluster by closest type color
  const detectedNodes: DetectedPixelNode[] = [];
  const availableTypes = Object.keys(typeAvgColors) as RssNodeType[];

  if (availableTypes.length === 0) {
    onProgress?.('No color profiles built — need more annotations');
    return [];
  }

  for (const cluster of clusters) {
    const gameX = Math.round((cluster.cx / w) * GAME_MAP_SIZE);
    const gameY = Math.round((cluster.cy / h) * GAME_MAP_SIZE);

    let bestType: RssNodeType = 'food';
    let bestDist = Infinity;
    for (const type of availableTypes) {
      const [ar, ag, ab] = typeAvgColors[type];
      const dist = Math.hypot(cluster.cr - ar, cluster.cg - ag, cluster.cb - ab);
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
 * The map terrain is mostly yellow-green and dark walls are near black.
 * Node icons are brighter and have different hues than the terrain.
 */
function isBrightNonTerrain(r: number, g: number, b: number): boolean {
  const brightness = (r + g + b) / 3;

  // Too dark (walls, borders, shadows)
  if (brightness < 80) return false;

  // Green/yellow-green terrain — the dominant map color
  // Terrain: green channel dominates, blue is low
  if (g > b + 40 && g > 100 && b < 140 && r < 220) return false;

  // Dark olive/brown terrain edges
  if (brightness < 120 && g > b) return false;

  // Very bright white/cream — could be node icons or map border
  // Node icons tend to have some color, not pure gray
  // Filter the beige/cream map border
  if (brightness > 200 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15) return false;

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
