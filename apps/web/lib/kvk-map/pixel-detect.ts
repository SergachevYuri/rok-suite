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

/** Downscale factor for template matching (4x smaller = faster) */
const SCALE = 4;
/** Template patch size in the downscaled image */
const TMPL_SIZE = 8;
/** Scan stride in downscaled pixels */
const STRIDE = 2;
/** Correlation threshold to accept a match (0-1, higher = stricter) */
const MATCH_THRESHOLD = 0.55;
/** Minimum distance between detected nodes in downscaled pixels */
const MIN_DIST = 6;

/**
 * Detect RSS nodes using template matching.
 * Extracts appearance templates from manual annotations, then scans
 * the downscaled map image for matching patterns.
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
  const origW = img.width;
  const origH = img.height;

  // Downscale for faster processing
  const w = Math.round(origW / SCALE);
  const h = Math.round(origH / SCALE);
  onProgress?.(`Downscaling ${origW}x${origH} → ${w}x${h}...`);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data; // RGBA flat array

  // Step 1: Build templates from annotations
  onProgress?.('Building templates from annotations...');
  const typeTemplates: Record<string, { data: Float32Array; count: number }> = {};
  const patchLen = TMPL_SIZE * TMPL_SIZE * 3; // RGB per pixel
  const half = Math.floor(TMPL_SIZE / 2);

  for (const ann of annotations) {
    // Convert game coords to downscaled pixel coords
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((ann.y / GAME_MAP_SIZE) * h);

    // Extract patch
    const patch = extractPatch(pixels, w, h, cx, cy, TMPL_SIZE);
    if (!patch) continue;

    if (!typeTemplates[ann.type]) {
      typeTemplates[ann.type] = { data: new Float32Array(patchLen), count: 0 };
    }
    const tmpl = typeTemplates[ann.type];
    for (let i = 0; i < patchLen; i++) {
      tmpl.data[i] += patch[i];
    }
    tmpl.count++;
  }

  // Average the templates
  const templates: { type: RssNodeType; data: Float32Array }[] = [];
  for (const [type, tmpl] of Object.entries(typeTemplates)) {
    if (tmpl.count === 0) continue;
    const avg = new Float32Array(patchLen);
    for (let i = 0; i < patchLen; i++) {
      avg[i] = tmpl.data[i] / tmpl.count;
    }
    templates.push({ type: type as RssNodeType, data: avg });
  }

  if (templates.length === 0) {
    onProgress?.('No valid templates — annotations may be outside image');
    return [];
  }

  onProgress?.(`Built ${templates.length} type templates, scanning...`);

  // Precompute template norms for NCC
  const tmplNorms = templates.map((t) => {
    let sum = 0;
    const mean = computeMean(t.data);
    for (let i = 0; i < t.data.length; i++) {
      const v = t.data[i] - mean;
      sum += v * v;
    }
    return Math.sqrt(sum);
  });

  // Step 2: Scan image with each template using NCC
  const matches: { x: number; y: number; type: RssNodeType; score: number }[] = [];
  const totalSteps = Math.ceil((h - TMPL_SIZE) / STRIDE);
  let step = 0;

  for (let sy = half; sy < h - half; sy += STRIDE) {
    for (let sx = half; sx < w - half; sx += STRIDE) {
      const patch = extractPatch(pixels, w, h, sx, sy, TMPL_SIZE);
      if (!patch) continue;

      const patchMean = computeMean(patch);
      let patchNorm = 0;
      for (let i = 0; i < patch.length; i++) {
        const v = patch[i] - patchMean;
        patchNorm += v * v;
      }
      patchNorm = Math.sqrt(patchNorm);

      if (patchNorm < 1) continue; // uniform patch, skip

      // Check each template
      for (let ti = 0; ti < templates.length; ti++) {
        const tmpl = templates[ti];
        const tmplMean = computeMean(tmpl.data);

        let cross = 0;
        for (let i = 0; i < patch.length; i++) {
          cross += (patch[i] - patchMean) * (tmpl.data[i] - tmplMean);
        }

        const ncc = cross / (patchNorm * tmplNorms[ti] + 1e-8);

        if (ncc >= MATCH_THRESHOLD) {
          matches.push({ x: sx, y: sy, type: tmpl.type, score: ncc });
        }
      }
    }

    step++;
    if (step % 50 === 0) {
      onProgress?.(`Scanning... ${Math.round((step / totalSteps) * 100)}%`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(`Found ${matches.length} matches, filtering...`);

  // Step 3: Non-maximum suppression — keep only the best match within MIN_DIST
  matches.sort((a, b) => b.score - a.score);
  const kept: typeof matches = [];

  for (const m of matches) {
    const tooClose = kept.some(
      (k) => Math.hypot(k.x - m.x, k.y - m.y) < MIN_DIST,
    );
    if (!tooClose) {
      kept.push(m);
    }
  }

  // Convert to game coordinates
  const detectedNodes: DetectedPixelNode[] = kept.map((m) => ({
    x: Math.round((m.x / w) * GAME_MAP_SIZE),
    y: Math.round((m.y / h) * GAME_MAP_SIZE),
    type: m.type,
  }));

  onProgress?.(`Detected ${detectedNodes.length} nodes`);
  return detectedNodes;
}

/** Extract an RGB patch centered at (cx, cy). Returns null if out of bounds. */
function extractPatch(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  size: number,
): Float32Array | null {
  const half = Math.floor(size / 2);
  if (cx - half < 0 || cx + half >= w || cy - half < 0 || cy + half >= h) {
    return null;
  }

  const patch = new Float32Array(size * size * 3);
  let pi = 0;
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      const idx = ((cy + dy) * w + (cx + dx)) * 4;
      patch[pi++] = pixels[idx];     // R
      patch[pi++] = pixels[idx + 1]; // G
      patch[pi++] = pixels[idx + 2]; // B
    }
  }
  return patch;
}

/** Compute mean of a float array */
function computeMean(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum / data.length;
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
