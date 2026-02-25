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

/** Downscale factor — 2x preserves node detail (~12px icons) */
const SCALE = 2;
/** Template patch size in downscaled pixels */
const TMPL_SIZE = 14;
/** Scan stride — tighter than before for better coverage */
const STRIDE = 4;
/** NCC threshold on whiteness map — lower is OK since whiteness removes background noise */
const MATCH_THRESHOLD = 0.45;
/** Minimum distance between detections in downscaled pixels */
const MIN_DIST = 12;
/** Minimum whiteness score (0–255) for a pixel to count as "white" in pre-filter */
const WHITENESS_PIXEL_MIN = 60;
/** Minimum white pixels in center 5x5 to pass pre-filter (out of 25) */
const WHITENESS_COUNT_MIN = 3;

/**
 * Whiteness score for a single pixel.
 * High for bright, unsaturated (white/gray) pixels; near zero for colored terrain.
 *
 *   white (255,255,255) → 255
 *   blended white-on-green (200,210,180) → ~155
 *   green terrain (100,140,60) → 0
 *   dark terrain (60,80,40) → 0
 */
function pixelWhiteness(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return Math.max(0, brightness - spread * 1.5);
}

/**
 * Detect RSS nodes using whiteness-map template matching.
 *
 * 1. Downscale 2x → ~4040x4040
 * 2. Compute whiteness map (single channel: white icons bright, terrain dark)
 * 3. Build averaged templates from manual annotations on the whiteness map
 * 4. Scan with stride 4, pre-filter on local whiteness peaks
 * 5. NCC on whiteness map (background-invariant)
 * 6. Non-maximum suppression
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

  // ── Compute whiteness map (single channel) ──
  onProgress?.('Computing whiteness map...');
  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
  }

  // ── Build averaged templates from annotations ──
  onProgress?.('Building templates from annotations...');
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const typeAccum: Record<string, { data: Float32Array; count: number }> = {};
  const tmpBuf = new Float32Array(patchLen);

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((ann.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(wMap, w, h, cx, cy, half, TMPL_SIZE, tmpBuf)) continue;

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

  onProgress?.(`Built ${templates.length} templates, scanning ${w}x${h}...`);

  // ── Scan with whiteness pre-filter, then NCC ──
  const matches: { x: number; y: number; type: RssNodeType; score: number }[] = [];
  const patchBuf = new Float32Array(patchLen);
  const totalRows = Math.ceil((h - TMPL_SIZE) / STRIDE);
  let rowCount = 0;
  let candidateCount = 0;

  for (let sy = half; sy < h - half; sy += STRIDE) {
    for (let sx = half; sx < w - half; sx += STRIDE) {
      // Pre-filter: center 5x5 must contain enough white-ish pixels
      if (!hasWhiteCluster(wMap, w, sx, sy)) continue;
      candidateCount++;

      if (!extractPatch(wMap, w, h, sx, sy, half, TMPL_SIZE, patchBuf)) continue;

      // NCC on whiteness channel
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

      // NCC against each template
      let bestScore = 0;
      let bestType: RssNodeType = 'food';
      for (const tmpl of templates) {
        let cross = 0;
        for (let i = 0; i < patchLen; i++) {
          cross += (patchBuf[i] - patchMean) * tmpl.centered[i];
        }
        const ncc = cross / (patchNorm * tmpl.norm + 1e-8);
        if (ncc > bestScore) {
          bestScore = ncc;
          bestType = tmpl.type;
        }
      }
      if (bestScore >= MATCH_THRESHOLD) {
        matches.push({ x: sx, y: sy, type: bestType, score: bestScore });
      }
    }

    rowCount++;
    if (rowCount % 20 === 0) {
      onProgress?.(`Scanning... ${Math.round((rowCount / totalRows) * 100)}%`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(`${candidateCount} candidates → ${matches.length} matches above threshold`);

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
 * Pre-filter: does the 5x5 neighborhood around (cx,cy) contain a cluster of
 * white-ish pixels? More forgiving than the old 3x3 bright+white check since
 * icon shapes vary (thin corn stalk, bulky stone cube, etc).
 */
function hasWhiteCluster(wMap: Float32Array, w: number, cx: number, cy: number): boolean {
  let count = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (wMap[(cy + dy) * w + (cx + dx)] >= WHITENESS_PIXEL_MIN) {
        count++;
        if (count >= WHITENESS_COUNT_MIN) return true;
      }
    }
  }
  return false;
}

/** Extract single-channel patch from a Float32Array map. */
function extractPatch(
  map: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  half: number,
  size: number,
  buf: Float32Array,
): boolean {
  if (cx - half < 0 || cx + half >= w || cy - half < 0 || cy + half >= h) return false;
  let pi = 0;
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      buf[pi++] = map[(cy + dy) * w + (cx + dx)];
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
