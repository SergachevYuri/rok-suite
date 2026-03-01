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
/** KNN K value for color tiebreaker */
const KNN_K = 7;

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

// ─── Per-sample patch KNN classifier ────────────────────────────────
//
// Instead of averaging training patches into one template per type (which
// blurs type-specific detail into generic white blobs), compare each query
// node's whiteness patch against EVERY individual training patch via NCC.
// Then distance-weighted KNN vote determines the type.
//
// Averaged templates are kept ONLY for Stage 1 detection scanning.

/** Individual whiteness patch sample for KNN matching */
interface PatchSample {
  type: RssNodeType;
  centered: Float32Array;  // mean-centered patch
  norm: number;            // L2 norm of centered patch
}

/** KNN K for patch-based classification */
const PATCH_KNN_K = 9;
/** Maximum patches per type for balanced KNN */
const MAX_PATCHES_PER_TYPE = 120;

/**
 * Extract and preprocess all training patches from the whiteness map.
 * Returns balanced per-type samples with mean-centered patches.
 */
function buildPatchSamples(
  wMap: Float32Array, w: number, h: number,
  annotations: AnnotationSample[],
): PatchSample[] {
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const tmpBuf = new Float32Array(patchLen);

  const byType: Partial<Record<RssNodeType, PatchSample[]>> = {};

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - ann.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(wMap, w, h, cx, cy, half, TMPL_SIZE, tmpBuf)) continue;

    let mean = 0;
    for (let i = 0; i < patchLen; i++) mean += tmpBuf[i];
    mean /= patchLen;

    const centered = new Float32Array(patchLen);
    let normSq = 0;
    for (let i = 0; i < patchLen; i++) {
      const v = tmpBuf[i] - mean;
      centered[i] = v;
      normSq += v * v;
    }
    if (normSq < 1) continue;

    (byType[ann.type] ??= []).push({
      type: ann.type, centered, norm: Math.sqrt(normSq),
    });
  }

  // Balance: limit each type to MAX_PATCHES_PER_TYPE
  const result: PatchSample[] = [];
  for (const group of Object.values(byType)) {
    if (!group) continue;
    if (group.length <= MAX_PATCHES_PER_TYPE) {
      result.push(...group);
    } else {
      const stride = group.length / MAX_PATCHES_PER_TYPE;
      for (let i = 0; i < MAX_PATCHES_PER_TYPE; i++) {
        result.push(group[Math.floor(i * stride)]);
      }
    }
  }
  return result;
}

/**
 * Classify by comparing query patch against all training patches via NCC,
 * then distance-weighted KNN vote. Returns winning type + top-2 types
 * and vote weights for potential color tiebreaker.
 */
function classifyByPatchKnn(
  wMap: Float32Array, w: number, h: number,
  cx: number, cy: number,
  patchSamples: PatchSample[],
): { type: RssNodeType; type2: RssNodeType; weight1: number; weight2: number } | null {
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const patchBuf = new Float32Array(patchLen);

  if (!extractPatch(wMap, w, h, cx, cy, half, TMPL_SIZE, patchBuf)) return null;

  // Mean-center query patch
  let qMean = 0;
  for (let i = 0; i < patchLen; i++) qMean += patchBuf[i];
  qMean /= patchLen;

  let qNormSq = 0;
  for (let i = 0; i < patchLen; i++) {
    patchBuf[i] -= qMean;
    qNormSq += patchBuf[i] * patchBuf[i];
  }
  if (qNormSq < 1) return null;
  const qNorm = Math.sqrt(qNormSq);

  // NCC against every training patch
  const scores: { idx: number; ncc: number }[] = [];
  for (let s = 0; s < patchSamples.length; s++) {
    const sample = patchSamples[s];
    let cross = 0;
    for (let i = 0; i < patchLen; i++) cross += patchBuf[i] * sample.centered[i];
    scores.push({ idx: s, ncc: cross / (qNorm * sample.norm + 1e-8) });
  }

  // Sort by NCC descending (most similar first)
  scores.sort((a, b) => b.ncc - a.ncc);

  // Distance-weighted vote among K nearest (weight = max(0, ncc))
  const k = Math.min(PATCH_KNN_K, scores.length);
  const votes: Partial<Record<RssNodeType, number>> = {};
  for (let i = 0; i < k; i++) {
    const type = patchSamples[scores[i].idx].type;
    const weight = Math.max(0, scores[i].ncc);
    votes[type] = (votes[type] || 0) + weight;
  }

  const typeVotes = Object.entries(votes)
    .sort((a, b) => b[1]! - a[1]!) as [RssNodeType, number][];
  if (typeVotes.length === 0) return null;

  return {
    type: typeVotes[0][0],
    type2: typeVotes.length > 1 ? typeVotes[1][0] : typeVotes[0][0],
    weight1: typeVotes[0][1],
    weight2: typeVotes.length > 1 ? typeVotes[1][1] : 0,
  };
}

// ─── Color tiebreaker (used when patch KNN is ambiguous) ────────────

/** Confidence threshold: if winner margin < this, use color to break tie */
const CONFIDENCE_THRESHOLD = 0.15;

interface TintSample {
  type: RssNodeType;
  rg: number; yb: number; sat: number;
}

interface ColorNormParams {
  rgMean: number; rgStd: number;
  ybMean: number; ybStd: number;
  satMean: number; satStd: number;
}

function computeColorNorm(samples: TintSample[]): ColorNormParams {
  const n = samples.length;
  if (n === 0) return { rgMean: 0, rgStd: 1, ybMean: 0, ybStd: 1, satMean: 0, satStd: 1 };
  let rgSum = 0, ybSum = 0, satSum = 0;
  for (const s of samples) { rgSum += s.rg; ybSum += s.yb; satSum += s.sat; }
  const rgMean = rgSum / n, ybMean = ybSum / n, satMean = satSum / n;
  let rgVar = 0, ybVar = 0, satVar = 0;
  for (const s of samples) {
    rgVar += (s.rg - rgMean) ** 2; ybVar += (s.yb - ybMean) ** 2; satVar += (s.sat - satMean) ** 2;
  }
  return {
    rgMean, rgStd: Math.max(1, Math.sqrt(rgVar / n)),
    ybMean, ybStd: Math.max(1, Math.sqrt(ybVar / n)),
    satMean, satStd: Math.max(1, Math.sqrt(satVar / n)),
  };
}

function normalizeColor(t: { rg: number; yb: number; sat: number }, p: ColorNormParams) {
  return {
    rg: (t.rg - p.rgMean) / p.rgStd,
    yb: (t.yb - p.ybMean) / p.ybStd,
    sat: (t.sat - p.satMean) / p.satStd,
  };
}

/** Color tiebreaker: binary KNN between two candidate types */
function colorTiebreak(
  query: { rg: number; yb: number; sat: number },
  typeA: RssNodeType, typeB: RssNodeType,
  colorSamples: TintSample[],
  colorNorm: ColorNormParams,
): RssNodeType {
  const qn = normalizeColor(query, colorNorm);
  const candidates = colorSamples.filter((s) => s.type === typeA || s.type === typeB);
  if (candidates.length === 0) return typeA;

  const dists = candidates.map((s) => {
    const sn = normalizeColor(s, colorNorm);
    return {
      type: s.type,
      dist: Math.sqrt((qn.rg - sn.rg) ** 2 + (qn.yb - sn.yb) ** 2 + (qn.sat - sn.sat) ** 2),
    };
  });
  dists.sort((a, b) => a.dist - b.dist);

  const k = Math.min(KNN_K, dists.length);
  let voteA = 0, voteB = 0;
  for (let i = 0; i < k; i++) {
    const w = 1 / (dists[i].dist + 0.01);
    if (dists[i].type === typeA) voteA += w; else voteB += w;
  }
  return voteA >= voteB ? typeA : typeB;
}

/**
 * Full classification: patch KNN primary, color tiebreaker when ambiguous.
 */
function classifyFull(
  wMap: Float32Array, dsW: number, dsH: number,
  dsCx: number, dsCy: number,
  patchSamples: PatchSample[],
  fullPixels: Uint8ClampedArray, fullW: number, fullH: number,
  gameX: number, gameY: number,
  colorSamples: TintSample[],
  colorNorm: ColorNormParams,
): RssNodeType {
  const knnResult = classifyByPatchKnn(wMap, dsW, dsH, dsCx, dsCy, patchSamples);
  if (!knnResult) return 'food';

  // Check if patch KNN is confident
  const totalWeight = knnResult.weight1 + knnResult.weight2;
  const confidence = totalWeight > 0 ? (knnResult.weight1 - knnResult.weight2) / totalWeight : 0;

  if (confidence >= CONFIDENCE_THRESHOLD || colorSamples.length === 0) {
    return knnResult.type;
  }

  // Low confidence — try color tiebreaker between top 2
  const fullCx = Math.round((gameX / GAME_MAP_SIZE) * fullW);
  const fullCy = Math.round((1 - gameY / GAME_MAP_SIZE) * fullH);
  const tint = sampleIconTint(fullPixels, fullW, fullH, fullCx, fullCy);
  if (!tint) return knnResult.type;

  return colorTiebreak(tint, knnResult.type, knnResult.type2, colorSamples, colorNorm);
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
 * Build color tint samples from annotations for the color tiebreaker.
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
 * Detect RSS nodes using two-stage whiteness detection + per-sample patch KNN.
 *
 * Stage 1 — Detection (whiteness, 2x downscale):
 *   Uses averaged templates for fast NCC scanning to find candidate positions.
 *
 * Stage 2 — Classification (per-sample patch KNN):
 *   Compares each candidate's patch against every training patch individually.
 *   Color tiebreaker when patch KNN is ambiguous.
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

  // ── Compute whiteness map ──
  onProgress?.('Computing whiteness map...');
  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(dsPixels[idx], dsPixels[idx + 1], dsPixels[idx + 2]);
  }

  // ── Build averaged templates for Stage 1 detection scanning ──
  onProgress?.('Building detection templates...');
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const typeAccum = accumulateTemplatePatches(wMap, w, h, annotations);
  const wTemplates = buildTypedTemplates(typeAccum);

  if (wTemplates.length === 0) {
    onProgress?.('No valid templates — annotations may be outside image');
    return [];
  }

  // ── Build per-sample patch KNN + color tiebreaker for Stage 2 ──
  const patchSamples = buildPatchSamples(wMap, w, h, annotations);
  const full = getFullResPixels(img);
  const colorSamples = buildTintSamples(full.pixels, full.w, full.h, annotations);
  const colorNorm = computeColorNorm(colorSamples);

  onProgress?.(`Built ${wTemplates.length} detection templates + ${patchSamples.length} patch samples, scanning ${w}x${h}...`);

  // ── Stage 1: Detect candidates using averaged template NCC ──
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

  // ── Non-maximum suppression ──
  candidates.sort((a, b) => b.score - a.score);
  const kept: typeof candidates = [];
  for (const c of candidates) {
    if (!kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < MIN_DIST)) {
      kept.push(c);
    }
  }

  onProgress?.(`After NMS: ${kept.length} nodes. Classifying types...`);

  // ── Stage 2: Classify using per-sample patch KNN + color tiebreaker ──
  const detectedNodes: DetectedPixelNode[] = [];

  for (let ci = 0; ci < kept.length; ci++) {
    const { x: sx, y: sy } = kept[ci];
    const gameX = Math.round((sx / w) * GAME_MAP_SIZE);
    const gameY = Math.round((1 - sy / h) * GAME_MAP_SIZE);

    const bestType = classifyFull(
      wMap, w, h, sx, sy, patchSamples,
      full.pixels, full.w, full.h, gameX, gameY,
      colorSamples, colorNorm,
    );

    detectedNodes.push({ x: gameX, y: gameY, type: bestType });

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
 * Per-sample patch KNN with color tiebreaker when ambiguous.
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

  const origW = img.width, origH = img.height;
  const w = Math.round(origW / SCALE);
  const h = Math.round(origH / SCALE);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const dsPixels = ctx.getImageData(0, 0, w, h).data;

  onProgress?.('Computing whiteness map...');
  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(dsPixels[idx], dsPixels[idx + 1], dsPixels[idx + 2]);
  }

  // ── Build per-sample patch KNN ──
  onProgress?.('Building patch samples...');
  const patchSamples = buildPatchSamples(wMap, w, h, trainingNodes);

  // Log stats per type
  const typeCounts: Partial<Record<RssNodeType, number>> = {};
  for (const s of patchSamples) typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`[RSS] Patch samples ${type}: ${count}`);
  }

  // ── Build color tiebreaker ──
  const full = getFullResPixels(img);
  const colorSamples = buildTintSamples(full.pixels, full.w, full.h, trainingNodes);
  const colorNorm = computeColorNorm(colorSamples);

  // ── Cross-validate: patch KNN on training data ──
  let cvCorrect = 0, cvTotal = 0;
  let tiebreakUsed = 0, tiebreakCorrect = 0;
  const cvConfusion: Record<string, Record<string, number>> = {};

  for (const tn of trainingNodes) {
    const dsCx = Math.round((tn.x / GAME_MAP_SIZE) * w);
    const dsCy = Math.round((1 - tn.y / GAME_MAP_SIZE) * h);
    const knnResult = classifyByPatchKnn(wMap, w, h, dsCx, dsCy, patchSamples);
    if (!knnResult) continue;
    cvTotal++;

    // Check tiebreaker
    const totalW = knnResult.weight1 + knnResult.weight2;
    const conf = totalW > 0 ? (knnResult.weight1 - knnResult.weight2) / totalW : 0;
    let predicted = knnResult.type;

    if (conf < CONFIDENCE_THRESHOLD && colorSamples.length > 0) {
      const fx = Math.round((tn.x / GAME_MAP_SIZE) * full.w);
      const fy = Math.round((1 - tn.y / GAME_MAP_SIZE) * full.h);
      const tint = sampleIconTint(full.pixels, full.w, full.h, fx, fy);
      if (tint) {
        predicted = colorTiebreak(tint, knnResult.type, knnResult.type2, colorSamples, colorNorm);
        tiebreakUsed++;
        if (predicted === tn.type) tiebreakCorrect++;
      }
    }

    if (predicted === tn.type) cvCorrect++;
    if (!cvConfusion[tn.type]) cvConfusion[tn.type] = {};
    cvConfusion[tn.type][predicted] = (cvConfusion[tn.type][predicted] || 0) + 1;
  }

  console.log(`[RSS] Patch KNN cross-validation: ${cvCorrect}/${cvTotal} = ${(cvCorrect / cvTotal * 100).toFixed(1)}% accuracy`);
  console.log(`[RSS] Color tiebreaker used: ${tiebreakUsed} times, correct: ${tiebreakCorrect}/${tiebreakUsed}`);
  console.log('[RSS] Confusion (true -> predicted):');
  for (const [trueType, preds] of Object.entries(cvConfusion)) {
    const parts = Object.entries(preds).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`);
    console.log(`  ${trueType} -> ${parts.join(', ')}`);
  }

  onProgress?.(`Re-classifying ${pendingNodes.length} nodes (${patchSamples.length} patch samples + ${colorSamples.length} color samples)...`);
  const results: RssNodeType[] = [];

  for (let i = 0; i < pendingNodes.length; i++) {
    const node = pendingNodes[i];
    const dsCx = Math.round((node.x / GAME_MAP_SIZE) * w);
    const dsCy = Math.round((1 - node.y / GAME_MAP_SIZE) * h);

    results.push(classifyFull(
      wMap, w, h, dsCx, dsCy, patchSamples,
      full.pixels, full.w, full.h, node.x, node.y,
      colorSamples, colorNorm,
    ));

    if (i % 200 === 0 && i > 0) {
      onProgress?.(`Re-classifying... ${Math.round((i / pendingNodes.length) * 100)}%`);
      await new Promise((r) => setTimeout(r, 0));
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
