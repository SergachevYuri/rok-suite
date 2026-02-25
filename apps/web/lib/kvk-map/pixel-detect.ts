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

/** Downscale factor (4x smaller = faster) */
const SCALE = 4;
/** Template patch size in the downscaled image */
const TMPL_SIZE = 8;
/** Scan stride in downscaled pixels */
const STRIDE = 4;
/** NCC threshold to accept a match (higher = stricter, fewer false positives) */
const MATCH_THRESHOLD = 0.72;
/** Minimum distance between detections in downscaled pixels */
const MIN_DIST = 10;
/**
 * Minimum average brightness (per channel, 0-255) for center 2x2 pixels.
 * White icons are ~200+, bright terrain is ~130-160, dark terrain ~60-90.
 */
const BRIGHTNESS_MIN = 155;
/**
 * Maximum color spread (max channel - min channel) for center pixels.
 * White/gray pixels have low spread (<40). Green grass has high spread (G >> R,B).
 * This eliminates bright but colorful terrain like light grass or sand.
 */
const MAX_COLOR_SPREAD = 50;

/**
 * Detect RSS nodes using template matching with brightness + whiteness pre-filter.
 *
 * 1. Downscale 4x → ~2020x2020
 * 2. Build averaged templates from manual annotations
 * 3. Scan with stride 4, skip patches where center isn't bright AND white
 * 4. NCC on white-bright candidates only (~1-2% of positions)
 * 5. Non-maximum suppression
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

  const w = Math.round(origW / SCALE);
  const h = Math.round(origH / SCALE);
  onProgress?.(`Downscaling ${origW}x${origH} → ${w}x${h}...`);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;

  // ── Build averaged templates from annotations ──
  onProgress?.('Building templates from annotations...');
  const patchLen = TMPL_SIZE * TMPL_SIZE * 3;
  const half = Math.floor(TMPL_SIZE / 2);
  const typeAccum: Record<string, { data: Float32Array; count: number }> = {};
  const tmpBuf = new Float32Array(patchLen);

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((ann.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(pixels, w, h, cx, cy, half, TMPL_SIZE, tmpBuf)) continue;

    if (!typeAccum[ann.type]) {
      typeAccum[ann.type] = { data: new Float32Array(patchLen), count: 0 };
    }
    const acc = typeAccum[ann.type];
    for (let i = 0; i < patchLen; i++) acc.data[i] += tmpBuf[i];
    acc.count++;
  }

  // ── Pre-compute centered templates (mean-subtracted) and norms ──
  const templates: {
    type: RssNodeType;
    centered: Float32Array;
    norm: number;
  }[] = [];

  for (const [type, acc] of Object.entries(typeAccum)) {
    if (acc.count === 0) continue;
    const avg = new Float32Array(patchLen);
    for (let i = 0; i < patchLen; i++) avg[i] = acc.data[i] / acc.count;

    let mean = 0;
    for (let i = 0; i < patchLen; i++) mean += avg[i];
    mean /= patchLen;

    const centered = new Float32Array(patchLen);
    let normSq = 0;
    for (let i = 0; i < patchLen; i++) {
      const v = avg[i] - mean;
      centered[i] = v;
      normSq += v * v;
    }
    templates.push({ type: type as RssNodeType, centered, norm: Math.sqrt(normSq) });
  }

  if (templates.length === 0) {
    onProgress?.('No valid templates — annotations may be outside image');
    return [];
  }

  onProgress?.(`Built ${templates.length} templates, scanning...`);

  // ── Scan with brightness + whiteness pre-filter, then NCC ──
  const matches: { x: number; y: number; type: RssNodeType; score: number }[] = [];
  const patchBuf = new Float32Array(patchLen);
  const totalRows = Math.ceil((h - TMPL_SIZE) / STRIDE);
  let rowCount = 0;
  let candidateCount = 0;

  for (let sy = half; sy < h - half; sy += STRIDE) {
    for (let sx = half; sx < w - half; sx += STRIDE) {
      // Quick check: center must be bright AND white (low color saturation)
      if (!isWhiteBrightCenter(pixels, w, sx, sy)) continue;
      candidateCount++;

      if (!extractPatch(pixels, w, h, sx, sy, half, TMPL_SIZE, patchBuf)) continue;

      // Compute patch mean and norm
      let patchMean = 0;
      for (let i = 0; i < patchLen; i++) patchMean += patchBuf[i];
      patchMean /= patchLen;

      let patchNormSq = 0;
      for (let i = 0; i < patchLen; i++) {
        const v = patchBuf[i] - patchMean;
        patchNormSq += v * v;
      }
      if (patchNormSq < 1) continue;
      const patchNorm = Math.sqrt(patchNormSq);

      // NCC against each pre-computed centered template
      for (const tmpl of templates) {
        let cross = 0;
        for (let i = 0; i < patchLen; i++) {
          cross += (patchBuf[i] - patchMean) * tmpl.centered[i];
        }
        const ncc = cross / (patchNorm * tmpl.norm + 1e-8);
        if (ncc >= MATCH_THRESHOLD) {
          matches.push({ x: sx, y: sy, type: tmpl.type, score: ncc });
        }
      }
    }

    rowCount++;
    if (rowCount % 15 === 0) {
      onProgress?.(`Scanning... ${Math.round((rowCount / totalRows) * 100)}%`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(`Checked ${candidateCount} candidates, found ${matches.length} matches`);

  // ── Non-maximum suppression ──
  matches.sort((a, b) => b.score - a.score);
  const kept: typeof matches = [];
  for (const m of matches) {
    if (!kept.some((k) => Math.hypot(k.x - m.x, k.y - m.y) < MIN_DIST)) {
      kept.push(m);
    }
  }

  const detectedNodes: DetectedPixelNode[] = kept.map((m) => ({
    x: Math.round((m.x / w) * GAME_MAP_SIZE),
    y: Math.round((m.y / h) * GAME_MAP_SIZE),
    type: m.type,
  }));

  onProgress?.(`Detected ${detectedNodes.length} nodes`);
  return detectedNodes;
}

/**
 * Quick check: are the center 2x2 pixels both bright AND white/gray?
 * White icons have high brightness (R+G+B > 465) and low color spread (max-min < 50).
 * This eliminates bright green grass (high G, low R/B) and bright sand (high R, lower G/B).
 */
function isWhiteBrightCenter(pixels: Uint8ClampedArray, w: number, cx: number, cy: number): boolean {
  let totalR = 0, totalG = 0, totalB = 0;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const idx = ((cy + dy) * w + (cx + dx)) * 4;
      totalR += pixels[idx];
      totalG += pixels[idx + 1];
      totalB += pixels[idx + 2];
    }
  }
  // Average per pixel across 4 samples
  const avgR = totalR / 4;
  const avgG = totalG / 4;
  const avgB = totalB / 4;

  // Brightness check: average channel value must be >= threshold
  if ((avgR + avgG + avgB) / 3 < BRIGHTNESS_MIN) return false;

  // Whiteness check: channels should be similar (low saturation)
  const maxC = Math.max(avgR, avgG, avgB);
  const minC = Math.min(avgR, avgG, avgB);
  if (maxC - minC > MAX_COLOR_SPREAD) return false;

  return true;
}

/** Extract RGB patch into a provided buffer. Returns false if out of bounds. */
function extractPatch(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  half: number,
  size: number,
  buf: Float32Array,
): boolean {
  if (cx - half < 0 || cx + half >= w || cy - half < 0 || cy + half >= h) {
    return false;
  }
  let pi = 0;
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      const idx = ((cy + dy) * w + (cx + dx)) * 4;
      buf[pi++] = pixels[idx];
      buf[pi++] = pixels[idx + 1];
      buf[pi++] = pixels[idx + 2];
    }
  }
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
