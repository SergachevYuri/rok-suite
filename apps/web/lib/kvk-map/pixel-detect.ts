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

/** Radius for color sampling at full resolution (~24px icons → sample 20px circle) */
const FULL_RES_SAMPLE_RADIUS = 10;
/** Minimum whiteness for a pixel to be considered part of the icon (not terrain) */
const ICON_WHITENESS_MIN = 65;
/** KNN K value for classification */
const KNN_K = 7;
/** Maximum training samples per class for balanced KNN */
const MAX_PER_CLASS = 150;
/** Distance threshold in normalized space: fall back to centroid if nearest neighbor exceeds this */
const CENTROID_FALLBACK_DIST = 4;

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
 * A training sample using opponent color channels — much better separation
 * for the subtle tint differences in near-white RSS icons.
 *
 * rg: red–green opponent (positive = warm/red, negative = green)
 * yb: yellow–blue opponent (positive = warm/yellow, negative = cool/purple)
 * sat: mean saturation — separates stone (gray, low sat) from colored types
 *
 * These three channels cleanly separate all five types:
 *   food:    rg < 0, yb > 0, sat medium  (green)
 *   wood:    rg > 0, yb > 0, sat high    (brown/amber)
 *   gold:    rg ~ 0, yb >> 0, sat high   (yellow)
 *   crystal: rg > 0, yb < 0, sat medium  (purple)
 *   stone:   rg ~ 0, yb ~ 0, sat low     (gray)
 */
interface TintSample {
  type: RssNodeType;
  rg: number;
  yb: number;
  sat: number;
}

/** Normalization parameters computed from training samples */
interface NormParams {
  rgMean: number; rgStd: number;
  ybMean: number; ybStd: number;
  satMean: number; satStd: number;
}

/** Compute z-score normalization parameters from training samples */
function computeNormParams(samples: TintSample[]): NormParams {
  const n = samples.length;
  if (n === 0) return { rgMean: 0, rgStd: 1, ybMean: 0, ybStd: 1, satMean: 0, satStd: 1 };

  let rgSum = 0, ybSum = 0, satSum = 0;
  for (const s of samples) { rgSum += s.rg; ybSum += s.yb; satSum += s.sat; }
  const rgMean = rgSum / n, ybMean = ybSum / n, satMean = satSum / n;

  let rgVar = 0, ybVar = 0, satVar = 0;
  for (const s of samples) {
    rgVar += (s.rg - rgMean) ** 2;
    ybVar += (s.yb - ybMean) ** 2;
    satVar += (s.sat - satMean) ** 2;
  }
  return {
    rgMean, rgStd: Math.max(1, Math.sqrt(rgVar / n)),
    ybMean, ybStd: Math.max(1, Math.sqrt(ybVar / n)),
    satMean, satStd: Math.max(1, Math.sqrt(satVar / n)),
  };
}

/** Apply z-score normalization to a tint vector */
function normalizeTint(t: { rg: number; yb: number; sat: number }, p: NormParams) {
  return {
    rg: (t.rg - p.rgMean) / p.rgStd,
    yb: (t.yb - p.ybMean) / p.ybStd,
    sat: (t.sat - p.satMean) / p.satStd,
  };
}

/**
 * Subsample training data so each class has at most MAX_PER_CLASS samples.
 * Uses deterministic stride-based selection for reproducibility.
 */
function balanceSamples(samples: TintSample[]): TintSample[] {
  const byType: Partial<Record<RssNodeType, TintSample[]>> = {};
  for (const s of samples) (byType[s.type] ??= []).push(s);

  const result: TintSample[] = [];
  for (const group of Object.values(byType)) {
    if (!group) continue;
    if (group.length <= MAX_PER_CLASS) {
      result.push(...group);
    } else {
      const stride = group.length / MAX_PER_CLASS;
      for (let i = 0; i < MAX_PER_CLASS; i++) result.push(group[Math.floor(i * stride)]);
    }
  }
  return result;
}

/** Per-class centroid in normalized feature space */
interface ClassCentroid { type: RssNodeType; rg: number; yb: number; sat: number }

/** Compute per-class centroids from ALL samples in normalized space */
function computeCentroids(samples: TintSample[], norm: NormParams): ClassCentroid[] {
  const accum: Partial<Record<RssNodeType, { rg: number; yb: number; sat: number; n: number }>> = {};
  for (const s of samples) {
    const nz = normalizeTint(s, norm);
    const a = accum[s.type] ??= { rg: 0, yb: 0, sat: 0, n: 0 };
    a.rg += nz.rg; a.yb += nz.yb; a.sat += nz.sat; a.n++;
  }
  return Object.entries(accum)
    .filter(([, a]) => a && a.n > 0)
    .map(([type, a]) => ({ type: type as RssNodeType, rg: a!.rg / a!.n, yb: a!.yb / a!.n, sat: a!.sat / a!.n }));
}

/** Nearest-centroid classifier — naturally balanced (one centroid per class) */
function classifyByCentroid(q: { rg: number; yb: number; sat: number }, centroids: ClassCentroid[]): RssNodeType {
  let bestType: RssNodeType = 'food';
  let bestDist = Infinity;
  for (const c of centroids) {
    const d = Math.sqrt((q.rg - c.rg) ** 2 + (q.yb - c.yb) ** 2 + (q.sat - c.sat) ** 2);
    if (d < bestDist) { bestDist = d; bestType = c.type; }
  }
  return bestType;
}

/**
 * Balanced KNN classifier with centroid fallback.
 * Expects pre-normalized, pre-balanced samples and a normalized query point.
 */
function classifyByKnn(
  queryNorm: { rg: number; yb: number; sat: number },
  samples: TintSample[],
  centroids: ClassCentroid[],
): RssNodeType {
  if (samples.length === 0) return classifyByCentroid(queryNorm, centroids);

  const dists = samples.map((s, i) => ({
    i,
    dist: Math.sqrt((queryNorm.rg - s.rg) ** 2 + (queryNorm.yb - s.yb) ** 2 + (queryNorm.sat - s.sat) ** 2),
  }));
  dists.sort((a, b) => a.dist - b.dist);

  // Centroid fallback when nearest neighbor is too far
  if (dists[0].dist > CENTROID_FALLBACK_DIST && centroids.length > 0) {
    return classifyByCentroid(queryNorm, centroids);
  }

  // Distance-weighted vote among K nearest
  const k = Math.min(KNN_K, dists.length);
  const votes: Partial<Record<RssNodeType, number>> = {};
  for (let i = 0; i < k; i++) {
    const type = samples[dists[i].i].type;
    const weight = 1 / (dists[i].dist + 0.01);
    votes[type] = (votes[type] || 0) + weight;
  }

  let bestType: RssNodeType = 'food';
  let bestWeight = 0;
  for (const [type, weight] of Object.entries(votes)) {
    if (weight! > bestWeight) { bestWeight = weight!; bestType = type as RssNodeType; }
  }
  return bestType;
}

/**
 * Prepare balanced, normalized training data for classification.
 */
function prepareClassifier(rawSamples: TintSample[]) {
  const norm = computeNormParams(rawSamples);
  const centroids = computeCentroids(rawSamples, norm);
  const balanced = balanceSamples(rawSamples);
  const balancedNorm: TintSample[] = balanced.map((s) => {
    const nz = normalizeTint(s, norm);
    return { type: s.type, rg: nz.rg, yb: nz.yb, sat: nz.sat };
  });
  return { balancedNorm, centroids, norm };
}

/** Whiteness template with type info preserved for shape-based classification */
interface TypedTemplate {
  type: RssNodeType;
  centered: Float32Array;
  norm: number;
}

/**
 * Build per-type averaged whiteness templates from accumulated patch data.
 * Preserves type info so templates can be used for shape-based classification.
 */
function buildTypedTemplates(
  typeAccum: Record<string, { data: Float32Array; count: number }>,
): TypedTemplate[] {
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const templates: TypedTemplate[] = [];

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
  return templates;
}

/**
 * Classify a position by shape — NCC against each type's whiteness template.
 * Returns the best matching type, its NCC score, and all per-type scores.
 */
function classifyByTemplateNcc(
  wMap: Float32Array, w: number, h: number,
  cx: number, cy: number,
  templates: TypedTemplate[],
): { type: RssNodeType; score: number; allScores: Record<string, number> } | null {
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const patchBuf = new Float32Array(patchLen);

  if (!extractPatch(wMap, w, h, cx, cy, half, TMPL_SIZE, patchBuf)) return null;

  let patchMean = 0;
  for (let i = 0; i < patchLen; i++) patchMean += patchBuf[i];
  patchMean /= patchLen;

  let patchNormSq = 0;
  for (let i = 0; i < patchLen; i++) {
    const v = patchBuf[i] - patchMean;
    patchNormSq += v * v;
  }
  if (patchNormSq < 1) return null;
  const patchNorm = Math.sqrt(patchNormSq);

  let bestType: RssNodeType = 'food';
  let bestScore = -1;
  const allScores: Record<string, number> = {};
  for (const tmpl of templates) {
    let cross = 0;
    for (let i = 0; i < patchLen; i++) {
      cross += (patchBuf[i] - patchMean) * tmpl.centered[i];
    }
    const ncc = cross / (patchNorm * tmpl.norm + 1e-8);
    allScores[tmpl.type] = ncc;
    if (ncc > bestScore) { bestScore = ncc; bestType = tmpl.type; }
  }
  return { type: bestType, score: bestScore, allScores };
}

/**
 * Accumulate whiteness patches from annotations into per-type accumulators.
 * Shared between detectNodesPixel and reclassifyNodeTypes.
 */
function accumulateTemplatePatches(
  wMap: Float32Array, w: number, h: number,
  annotations: AnnotationSample[],
): Record<string, { data: Float32Array; count: number }> {
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
  return typeAccum;
}

/** Number of most-tinted pixels to use for classification */
const TOP_N_PIXELS = 30;

/**
 * Sample the color signature of an RSS icon at full resolution.
 *
 * Instead of averaging all pixels (which washes out subtle tints on near-white
 * icons), we collect all bright pixels in the sample area, sort by color
 * spread (saturation), and take the top N most-tinted pixels. These carry
 * the strongest type signal — they're the icon border/rim pixels where the
 * type color shows through.
 *
 * Returns opponent color channels (rg, yb) + mean saturation.
 */
function sampleIconTint(
  pixels: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number,
): { rg: number; yb: number; sat: number } | null {
  const rSq = FULL_RES_SAMPLE_RADIUS * FULL_RES_SAMPLE_RADIUS;

  // Collect icon pixels using whiteness filter (not raw brightness).
  // Raw brightness >= 140 lets in colored terrain (brown dirt, green grass)
  // which contaminates the tint signal. Whiteness penalizes saturation,
  // so only genuinely white-ish icon pixels pass through.
  const candidates: { r: number; g: number; b: number; spread: number }[] = [];

  for (let dy = -FULL_RES_SAMPLE_RADIUS; dy <= FULL_RES_SAMPLE_RADIUS; dy++) {
    for (let dx = -FULL_RES_SAMPLE_RADIUS; dx <= FULL_RES_SAMPLE_RADIUS; dx++) {
      if (dx * dx + dy * dy > rSq) continue;

      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= w || py < 0 || py >= h) continue;

      const idx = (py * w + px) * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

      // Must be white enough to be part of the icon — rejects colored terrain
      if (pixelWhiteness(r, g, b) < ICON_WHITENESS_MIN) continue;

      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      candidates.push({ r, g, b, spread });
    }
  }

  if (candidates.length < 5) return null;

  // Sort by spread descending — most-tinted pixels first
  candidates.sort((a, b) => b.spread - a.spread);

  // Take top N most-tinted pixels
  const n = Math.min(TOP_N_PIXELS, candidates.length);
  let rgSum = 0, ybSum = 0, satSum = 0;

  for (let i = 0; i < n; i++) {
    const { r, g, b, spread } = candidates[i];
    // Opponent color channels
    rgSum += r - g;                    // red–green
    ybSum += (r + g) / 2 - b;         // yellow–blue
    satSum += spread;
  }

  return { rg: rgSum / n, yb: ybSum / n, sat: satSum / n };
}

/**
 * Build tint samples from annotations using full-resolution pixel data.
 */
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
 * Load full-resolution pixel data from an image element.
 * Used for color classification where downscaling loses subtle tint info.
 */
function getFullResPixels(img: HTMLImageElement): {
  pixels: Uint8ClampedArray; w: number; h: number;
} {
  const w = img.width, h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return { pixels: ctx.getImageData(0, 0, w, h).data, w, h };
}

/**
 * Detect RSS nodes using two-stage whiteness detection + full-res color classification.
 *
 * Stage 1 — Detection (whiteness, 2x downscale):
 *   1. Downscale 2x → ~4040x4040
 *   2. Compute whiteness map (single channel: white icons bright, terrain dark)
 *   3. Build averaged whiteness templates from manual annotations
 *   4. Scan with stride 4, pre-filter on local whiteness peaks
 *   5. NCC on whiteness map → candidate positions
 *
 * Stage 2 — Classification (full resolution):
 *   6. Load full-res pixels for color sampling
 *   7. Sample icon tint (deviation-from-gray) with whiteness-filtered pixels
 *   8. Classify each candidate via K-nearest-neighbors on tint vectors
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
  const dsPixels = ctx.getImageData(0, 0, w, h).data;

  // ── Compute whiteness map (single channel) ──
  onProgress?.('Computing whiteness map...');
  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(dsPixels[idx], dsPixels[idx + 1], dsPixels[idx + 2]);
  }

  // ── Build per-type whiteness templates for detection + shape classification ──
  onProgress?.('Building templates from annotations...');
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const typeAccum = accumulateTemplatePatches(wMap, w, h, annotations);
  const wTemplates = buildTypedTemplates(typeAccum);

  if (wTemplates.length === 0) {
    onProgress?.('No valid templates — annotations may be outside image');
    return [];
  }

  // ── Load full-res pixels for color classification ──
  onProgress?.('Loading full-res pixels for color classification...');
  const full = getFullResPixels(img);

  // ── Build per-annotation tint samples for KNN classification (full-res) ──
  const tintSamples = buildTintSamples(full.pixels, full.w, full.h, annotations);
  const { balancedNorm, centroids, norm } = prepareClassifier(tintSamples);

  onProgress?.(`Built ${wTemplates.length} detection templates + ${tintSamples.length} color samples (${balancedNorm.length} balanced), scanning ${w}x${h}...`);

  // ── Stage 1: Detect candidates using whiteness NCC + track best template type ──
  const candidates: { x: number; y: number; score: number; templateType: RssNodeType }[] = [];
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

      // Best NCC across all type templates — track which type matched best (shape signal)
      let bestScore = 0;
      let bestTemplateType: RssNodeType = 'food';
      for (const tmpl of wTemplates) {
        let cross = 0;
        for (let i = 0; i < patchLen; i++) {
          cross += (patchBuf[i] - patchMean) * tmpl.centered[i];
        }
        const ncc = cross / (patchNorm * tmpl.norm + 1e-8);
        if (ncc > bestScore) { bestScore = ncc; bestTemplateType = tmpl.type; }
      }
      if (bestScore >= MATCH_THRESHOLD) {
        candidates.push({ x: sx, y: sy, score: bestScore, templateType: bestTemplateType });
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

  // ── Stage 2: Classify using shape (template NCC) as primary, color as fallback ──
  const detectedNodes: DetectedPixelNode[] = [];

  for (let ci = 0; ci < kept.length; ci++) {
    const { x: sx, y: sy, templateType } = kept[ci];

    // Shape-based classification is primary — it was computed during detection
    let bestType: RssNodeType = templateType;

    // Color KNN as fallback only when template match is unavailable
    if (!templateType && balancedNorm.length > 0) {
      const fullX = Math.round((sx / w) * full.w);
      const fullY = Math.round((sy / h) * full.h);
      const tint = sampleIconTint(full.pixels, full.w, full.h, fullX, fullY);
      if (tint) {
        bestType = classifyByKnn(normalizeTint(tint, norm), balancedNorm, centroids);
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
 * Uses shape-based template matching (primary) with color KNN as fallback.
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

  // ── Build shape templates (downscaled whiteness map) ──
  const origW = img.width, origH = img.height;
  const w = Math.round(origW / SCALE);
  const h = Math.round(origH / SCALE);
  onProgress?.('Building shape templates...');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const dsPixels = ctx.getImageData(0, 0, w, h).data;

  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(dsPixels[idx], dsPixels[idx + 1], dsPixels[idx + 2]);
  }

  const typeAccum = accumulateTemplatePatches(wMap, w, h, trainingNodes);
  const wTemplates = buildTypedTemplates(typeAccum);

  // Log template stats
  for (const [type, acc] of Object.entries(typeAccum)) {
    console.log(`[RSS] Template ${type}: ${acc.count} samples`);
  }

  // ── Build color classifier as fallback ──
  const full = getFullResPixels(img);
  const tintSamples = buildTintSamples(full.pixels, full.w, full.h, trainingNodes);
  const { balancedNorm, centroids, norm } = prepareClassifier(tintSamples);

  // ── Cross-validate: test shape templates against training nodes ──
  let cvCorrect = 0, cvTotal = 0;
  const cvConfusion: Record<string, Record<string, number>> = {};
  const margins: number[] = []; // gap between best and 2nd-best NCC
  for (const tn of trainingNodes) {
    const tx = Math.round((tn.x / GAME_MAP_SIZE) * w);
    const ty = Math.round((1 - tn.y / GAME_MAP_SIZE) * h);
    const result = classifyByTemplateNcc(wMap, w, h, tx, ty, wTemplates);
    if (!result) continue;
    cvTotal++;
    if (result.type === tn.type) cvCorrect++;
    if (!cvConfusion[tn.type]) cvConfusion[tn.type] = {};
    cvConfusion[tn.type][result.type] = (cvConfusion[tn.type][result.type] || 0) + 1;

    // Compute margin: gap between best and 2nd-best score
    const scores = Object.values(result.allScores).sort((a, b) => b - a);
    if (scores.length >= 2) margins.push(scores[0] - scores[1]);
  }
  console.log(`[RSS] Shape template cross-validation: ${cvCorrect}/${cvTotal} = ${(cvCorrect / cvTotal * 100).toFixed(1)}% accuracy`);
  console.log('[RSS] Confusion (true → predicted):');
  for (const [trueType, preds] of Object.entries(cvConfusion)) {
    const parts = Object.entries(preds).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`);
    console.log(`  ${trueType} → ${parts.join(', ')}`);
  }
  if (margins.length > 0) {
    margins.sort((a, b) => a - b);
    const med = margins[Math.floor(margins.length / 2)];
    const p10 = margins[Math.floor(margins.length * 0.1)];
    const p90 = margins[Math.floor(margins.length * 0.9)];
    console.log(`[RSS] NCC margin (best - 2nd): median=${med.toFixed(4)}, p10=${p10.toFixed(4)}, p90=${p90.toFixed(4)}`);
    console.log(`[RSS] ${margins.filter(m => m < 0.01).length}/${margins.length} nodes with margin < 0.01 (basically guessing)`);
  }

  onProgress?.(`Re-classifying ${pendingNodes.length} nodes (${wTemplates.length} shape templates + ${balancedNorm.length} color samples)...`);
  const results: RssNodeType[] = [];

  for (const node of pendingNodes) {
    // Shape classification (primary) — template NCC on downscaled whiteness
    const dsCx = Math.round((node.x / GAME_MAP_SIZE) * w);
    const dsCy = Math.round((1 - node.y / GAME_MAP_SIZE) * h);
    const shapeResult = classifyByTemplateNcc(wMap, w, h, dsCx, dsCy, wTemplates);

    if (shapeResult) {
      results.push(shapeResult.type);
    } else if (balancedNorm.length > 0) {
      // Color fallback when template matching fails (edge of image, etc.)
      const fx = Math.round((node.x / GAME_MAP_SIZE) * full.w);
      const fy = Math.round((1 - node.y / GAME_MAP_SIZE) * full.h);
      const tint = sampleIconTint(full.pixels, full.w, full.h, fx, fy);
      if (tint) {
        results.push(classifyByKnn(normalizeTint(tint, norm), balancedNorm, centroids));
      } else {
        results.push('food');
      }
    } else {
      results.push('food');
    }
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

  // Surround: sample two rings at distance 6 and 8 for more stable contrast
  let surroundSum = 0;
  let surroundCount = 0;
  for (const d of [6, 8]) {
    surroundSum += wMap[(cy - d) * w + cx];
    surroundSum += wMap[(cy + d) * w + cx];
    surroundSum += wMap[cy * w + (cx - d)];
    surroundSum += wMap[cy * w + (cx + d)];
    surroundSum += wMap[(cy - d) * w + (cx - d)];
    surroundSum += wMap[(cy - d) * w + (cx + d)];
    surroundSum += wMap[(cy + d) * w + (cx - d)];
    surroundSum += wMap[(cy + d) * w + (cx + d)];
    surroundCount += 8;
  }
  const surroundAvg = surroundSum / surroundCount;

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
