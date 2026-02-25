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
/** NCC threshold for whiteness-based detection (Stage 1 — be inclusive, Stage 2 refines) */
const MATCH_THRESHOLD = 0.48;
/** Minimum distance between detections in downscaled pixels */
const MIN_DIST = 12;
/** Minimum average whiteness of center 3x3 to be a potential icon */
const CENTER_WHITENESS_MIN = 85;
/**
 * Minimum contrast between center 3x3 and surrounding ring.
 * RSS icons are bright blobs on dark terrain → high contrast.
 * Light paths/rocks are uniformly bright → low contrast.
 */
const CONTRAST_MIN = 35;

/**
 * Color sampling radii (in downscaled px).
 * The icon center is mostly white — the color tint is in the ring.
 * Inner: skip the pure-white center.  Outer: capture the colored halo.
 */
const COLOR_INNER_RADIUS = 2; // skip center 5x5
const COLOR_OUTER_RADIUS = 6; // sample up to 13x13

/** KNN K value for classification */
const KNN_K = 5;

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

/** A single training sample: tint vector + known type */
interface TintSample {
  type: RssNodeType;
  dr: number;
  dg: number;
  db: number;
}

/** Euclidean distance between two tint vectors */
function tintDist(a: { dr: number; dg: number; db: number }, b: { dr: number; dg: number; db: number }): number {
  const dd = a.dr - b.dr, dg = a.dg - b.dg, db = a.db - b.db;
  return Math.sqrt(dd * dd + dg * dg + db * db);
}

/**
 * KNN classifier: find the K nearest training samples by tint distance
 * and return the majority type.
 */
function classifyByKnn(
  tint: { dr: number; dg: number; db: number },
  samples: TintSample[],
): RssNodeType {
  if (samples.length === 0) return 'food';

  // Compute distances to all training samples
  const dists = samples.map((s, i) => ({ i, dist: tintDist(tint, s) }));
  dists.sort((a, b) => a.dist - b.dist);

  // Vote among K nearest
  const k = Math.min(KNN_K, dists.length);
  const votes: Partial<Record<RssNodeType, number>> = {};
  for (let i = 0; i < k; i++) {
    const type = samples[dists[i].i].type;
    votes[type] = (votes[type] || 0) + 1;
  }

  let bestType: RssNodeType = 'food';
  let bestCount = 0;
  for (const [type, count] of Object.entries(votes)) {
    if (count! > bestCount) {
      bestCount = count!;
      bestType = type as RssNodeType;
    }
  }
  return bestType;
}

/**
 * Sample the color tint of an RSS icon by looking at the ring of pixels
 * around the white center.  The center is mostly white (low saturation);
 * the colored halo at radius 2–6 carries the actual type color.
 *
 * Returns a "deviation from gray" vector (dr, dg, db) which is more
 * stable than HSL hue for near-white colors.  Each component is the
 * channel value minus the per-pixel mean, averaged across the ring,
 * weighted by each pixel's saturation (so colorful pixels count more).
 */
function sampleIconTint(
  pixels: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number,
): { dr: number; dg: number; db: number } | null {
  let drSum = 0, dgSum = 0, dbSum = 0, weightSum = 0;

  for (let dy = -COLOR_OUTER_RADIUS; dy <= COLOR_OUTER_RADIUS; dy++) {
    for (let dx = -COLOR_OUTER_RADIUS; dx <= COLOR_OUTER_RADIUS; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Skip center (too white) and corners (outside icon)
      if (dist < COLOR_INNER_RADIUS || dist > COLOR_OUTER_RADIUS) continue;

      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= w || py < 0 || py >= h) continue;

      const idx = (py * w + px) * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

      // Only consider bright pixels (part of the icon, not terrain)
      const brightness = (r + g + b) / 3;
      if (brightness < 120) continue;

      // Saturation as weight — more saturated pixels carry more color info
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const sat = brightness > 0 ? spread / brightness : 0;
      const weight = 0.1 + sat; // small base weight so even low-sat pixels contribute

      // Deviation from gray
      const avg = brightness;
      drSum += (r - avg) * weight;
      dgSum += (g - avg) * weight;
      dbSum += (b - avg) * weight;
      weightSum += weight;
    }
  }

  if (weightSum < 0.01) return null;
  return { dr: drSum / weightSum, dg: dgSum / weightSum, db: dbSum / weightSum };
}

/** Build tint samples from annotations — used by both detect and reclassify. */
function buildTintSamples(
  pixels: Uint8ClampedArray, w: number, h: number,
  annotations: AnnotationSample[],
): TintSample[] {
  const samples: TintSample[] = [];
  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - ann.y / GAME_MAP_SIZE) * h);
    const tint = sampleIconTint(pixels, w, h, cx, cy);
    if (tint) samples.push({ type: ann.type, ...tint });
  }
  return samples;
}

/**
 * Detect RSS nodes using two-stage whiteness + RGB template matching.
 *
 * Stage 1 — Detection (whiteness):
 *   1. Downscale 2x → ~4040x4040
 *   2. Compute whiteness map (single channel: white icons bright, terrain dark)
 *   3. Build averaged whiteness templates from manual annotations
 *   4. Scan with stride 4, pre-filter on local whiteness peaks
 *   5. NCC on whiteness map → candidate positions
 *
 * Stage 2 — Classification (tint KNN):
 *   6. Sample icon ring tint (deviation-from-gray) for each annotation
 *   7. Classify each candidate via K-nearest-neighbors on tint vectors
 *
 * Final: Non-maximum suppression
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

  // ── Build whiteness templates from annotations (for detection) ──
  onProgress?.('Building templates from annotations...');
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const typeAccum: Record<string, { data: Float32Array; count: number }> = {};
  const tmpBuf = new Float32Array(patchLen);

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - ann.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(wMap, w, h, cx, cy, half, TMPL_SIZE, tmpBuf)) continue;

    if (!typeAccum[ann.type]) {
      typeAccum[ann.type] = { data: new Float32Array(patchLen), count: 0 };
    }
    const acc = typeAccum[ann.type];
    for (let i = 0; i < patchLen; i++) acc.data[i] += tmpBuf[i];
    acc.count++;
  }

  // Pre-compute centered whiteness templates
  const wTemplates: { centered: Float32Array; norm: number }[] = [];

  for (const acc of Object.values(typeAccum)) {
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
    wTemplates.push({ centered, norm: Math.sqrt(normSq) });
  }

  if (wTemplates.length === 0) {
    onProgress?.('No valid templates — annotations may be outside image');
    return [];
  }

  // ── Build per-annotation tint samples for KNN classification ──
  const tintSamples = buildTintSamples(pixels, w, h, annotations);

  onProgress?.(`Built ${wTemplates.length} detection templates + ${tintSamples.length} color samples, scanning ${w}x${h}...`);

  // ── Stage 1: Detect candidates using whiteness NCC ──
  const candidates: { x: number; y: number; score: number }[] = [];
  const patchBuf = new Float32Array(patchLen);
  const totalRows = Math.ceil((h - TMPL_SIZE) / STRIDE);
  let rowCount = 0;

  for (let sy = half; sy < h - half; sy += STRIDE) {
    for (let sx = half; sx < w - half; sx += STRIDE) {
      if (!hasBrightBlob(wMap, w, sx, sy)) continue;
      if (!extractPatch(wMap, w, h, sx, sy, half, TMPL_SIZE, patchBuf)) continue;

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

      // Best NCC across all whiteness templates (type doesn't matter here)
      let bestScore = 0;
      for (const tmpl of wTemplates) {
        let cross = 0;
        for (let i = 0; i < patchLen; i++) {
          cross += (patchBuf[i] - patchMean) * tmpl.centered[i];
        }
        const ncc = cross / (patchNorm * tmpl.norm + 1e-8);
        if (ncc > bestScore) bestScore = ncc;
      }
      if (bestScore >= MATCH_THRESHOLD) {
        candidates.push({ x: sx, y: sy, score: bestScore });
      }
    }

    rowCount++;
    if (rowCount % 20 === 0) {
      onProgress?.(`Detecting... ${Math.round((rowCount / totalRows) * 100)}%`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(`Stage 1: ${candidates.length} detections`);

  // ── Non-maximum suppression on detection candidates ──
  candidates.sort((a, b) => b.score - a.score);
  const kept: typeof candidates = [];
  for (const c of candidates) {
    if (!kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < MIN_DIST)) {
      kept.push(c);
    }
  }

  onProgress?.(`After NMS: ${kept.length} nodes. Classifying types...`);

  // ── Stage 2: Classify each kept detection using KNN on tint vectors ──
  const detectedNodes: DetectedPixelNode[] = [];

  for (let ci = 0; ci < kept.length; ci++) {
    const { x: sx, y: sy } = kept[ci];
    let bestType: RssNodeType = 'food';

    if (tintSamples.length > 0) {
      const tint = sampleIconTint(pixels, w, h, sx, sy);
      if (tint) {
        bestType = classifyByKnn(tint, tintSamples);
      }
    }

    detectedNodes.push({
      x: Math.round((sx / w) * GAME_MAP_SIZE),
      y: Math.round((1 - sy / h) * GAME_MAP_SIZE),
      type: bestType,
    });

    if (ci % 500 === 0 && ci > 0) {
      onProgress?.(`Classifying... ${Math.round((ci / kept.length) * 100)}%`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(`Detected ${detectedNodes.length} nodes`);
  return detectedNodes;
}

/**
 * Re-classify pending detected nodes using corrected nodes as better training data.
 * Loads the image, builds KNN tint samples from corrected annotations, and re-types
 * only the pending nodes. Skips the full detection scan.
 */
export async function reclassifyNodeTypes(
  imageUrl: string,
  trainingNodes: AnnotationSample[],
  pendingNodes: { x: number; y: number }[],
  onProgress?: (msg: string) => void,
): Promise<RssNodeType[]> {
  if (trainingNodes.length === 0) return pendingNodes.map(() => 'food');

  onProgress?.('Loading image for re-classification...');
  const img = await loadImage(imageUrl);
  const w = Math.round(img.width / SCALE);
  const h = Math.round(img.height / SCALE);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;

  // Build tint samples from training nodes (manual + corrected)
  onProgress?.(`Building tint samples from ${trainingNodes.length} corrected nodes...`);
  const tintSamples = buildTintSamples(pixels, w, h, trainingNodes);

  if (tintSamples.length === 0) return pendingNodes.map(() => 'food');

  // Log per-type tint stats to help debug classification quality
  const typeStats: Record<string, { count: number; dr: number; dg: number; db: number }> = {};
  for (const s of tintSamples) {
    if (!typeStats[s.type]) typeStats[s.type] = { count: 0, dr: 0, dg: 0, db: 0 };
    const ts = typeStats[s.type];
    ts.count++;
    ts.dr += s.dr;
    ts.dg += s.dg;
    ts.db += s.db;
  }
  for (const [type, ts] of Object.entries(typeStats)) {
    const avg = { dr: ts.dr / ts.count, dg: ts.dg / ts.count, db: ts.db / ts.count };
    console.log(`[RSS] ${type}: n=${ts.count}, avg tint=(${avg.dr.toFixed(2)}, ${avg.dg.toFixed(2)}, ${avg.db.toFixed(2)})`);
  }

  // Re-classify each pending node using KNN
  onProgress?.(`Re-classifying ${pendingNodes.length} nodes with ${tintSamples.length} samples (KNN k=${KNN_K})...`);
  const results: RssNodeType[] = [];

  for (const node of pendingNodes) {
    const sx = Math.round((node.x / GAME_MAP_SIZE) * w);
    const sy = Math.round((1 - node.y / GAME_MAP_SIZE) * h);
    const tint = sampleIconTint(pixels, w, h, sx, sy);
    results.push(tint ? classifyByKnn(tint, tintSamples) : 'food');
  }

  onProgress?.(`Re-classified ${results.length} nodes`);
  return results;
}

/**
 * Pre-filter: is there a bright white blob at (cx,cy) that stands out from
 * its surroundings? RSS icons are bright white on dark terrain → high contrast.
 * Light paths and rocky areas are also bright but blend with neighbors → low contrast.
 */
function hasBrightBlob(wMap: Float32Array, w: number, cx: number, cy: number): boolean {
  // Center 3x3 average whiteness
  let centerSum = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      centerSum += wMap[(cy + dy) * w + (cx + dx)];
    }
  }
  const centerAvg = centerSum / 9;
  if (centerAvg < CENTER_WHITENESS_MIN) return false;

  // Surround: sample 8 points at distance 6 (just outside icon radius ~5-6px)
  const d = 6;
  let surroundSum = 0;
  surroundSum += wMap[(cy - d) * w + cx];
  surroundSum += wMap[(cy + d) * w + cx];
  surroundSum += wMap[cy * w + (cx - d)];
  surroundSum += wMap[cy * w + (cx + d)];
  surroundSum += wMap[(cy - d) * w + (cx - d)];
  surroundSum += wMap[(cy - d) * w + (cx + d)];
  surroundSum += wMap[(cy + d) * w + (cx - d)];
  surroundSum += wMap[(cy + d) * w + (cx + d)];
  const surroundAvg = surroundSum / 8;

  return (centerAvg - surroundAvg) >= CONTRAST_MIN;
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
