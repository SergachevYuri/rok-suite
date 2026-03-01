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

/** Template patch size at full resolution for high-detail classification */
const FULL_TMPL_SIZE = 24;

/**
 * Compute Sobel gradient magnitude map from a single-channel Float32Array.
 * Captures edges and internal icon structure that whiteness blobs miss.
 */
function computeEdgeMap(src: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = src[y * w + (x + 1)] - src[y * w + (x - 1)];
      const gy = src[(y + 1) * w + x] - src[(y - 1) * w + x];
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
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
  tmplSize = TMPL_SIZE,
): TypedTemplate[] {
  const patchLen = tmplSize * tmplSize;
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
  tmplSize = TMPL_SIZE,
): Record<string, { data: Float32Array; count: number }> {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const typeAccum: Record<string, { data: Float32Array; count: number }> = {};
  const tmpBuf = new Float32Array(patchLen);

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - ann.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, tmpBuf)) continue;

    if (!typeAccum[ann.type]) {
      typeAccum[ann.type] = { data: new Float32Array(patchLen), count: 0 };
    }
    const acc = typeAccum[ann.type];
    for (let i = 0; i < patchLen; i++) acc.data[i] += tmpBuf[i];
    acc.count++;
  }
  return typeAccum;
}

/**
 * Build a whiteness map from raw RGBA pixel data.
 */
function buildWhitenessMap(
  pixels: Uint8ClampedArray, w: number, h: number,
): Float32Array {
  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
  }
  return wMap;
}

/**
 * Classify a position using averaged template NCC at a given resolution.
 * Returns the type with the highest NCC score.
 */
function classifyByTemplateNcc(
  wMap: Float32Array, w: number, h: number,
  cx: number, cy: number,
  templates: TypedTemplate[],
  tmplSize: number,
): RssNodeType {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const patchBuf = new Float32Array(patchLen);

  if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, patchBuf)) return 'food';

  let patchMean = 0;
  for (let i = 0; i < patchLen; i++) patchMean += patchBuf[i];
  patchMean /= patchLen;

  let patchNormSq = 0;
  for (let i = 0; i < patchLen; i++) {
    patchBuf[i] -= patchMean;
    patchNormSq += patchBuf[i] * patchBuf[i];
  }
  if (patchNormSq < 1) return 'food';
  const patchNorm = Math.sqrt(patchNormSq);

  let bestType: RssNodeType = 'food';
  let bestScore = -1;

  for (const tmpl of templates) {
    let cross = 0;
    for (let i = 0; i < patchLen; i++) cross += patchBuf[i] * tmpl.centered[i];
    const ncc = cross / (patchNorm * tmpl.norm + 1e-8);
    if (ncc > bestScore) {
      bestScore = ncc;
      bestType = tmpl.type;
    }
  }
  return bestType;
}

/**
 * Classify using combined whiteness + edge NCC scores.
 * Edge templates capture internal icon structure (wheat lines, crystal facets, etc.)
 * that whiteness blobs miss. The combined score gives more discriminative matching.
 */
function classifyCombinedNcc(
  wMap: Float32Array, edgeMap: Float32Array, w: number, h: number,
  cx: number, cy: number,
  wTemplates: TypedTemplate[], eTemplates: TypedTemplate[],
  tmplSize: number,
  edgeWeight: number,
): RssNodeType {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const wBuf = new Float32Array(patchLen);
  const eBuf = new Float32Array(patchLen);

  if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, wBuf)) return 'food';
  if (!extractPatch(edgeMap, w, h, cx, cy, half, tmplSize, eBuf)) return 'food';

  // Mean-center both patches
  let wMean = 0, eMean = 0;
  for (let i = 0; i < patchLen; i++) { wMean += wBuf[i]; eMean += eBuf[i]; }
  wMean /= patchLen; eMean /= patchLen;

  let wNSq = 0, eNSq = 0;
  for (let i = 0; i < patchLen; i++) {
    wBuf[i] -= wMean; wNSq += wBuf[i] * wBuf[i];
    eBuf[i] -= eMean; eNSq += eBuf[i] * eBuf[i];
  }
  const wN = Math.sqrt(wNSq);
  const eN = Math.sqrt(eNSq);

  // Build type -> edge template lookup
  const eMap = new Map(eTemplates.map(t => [t.type, t]));

  let bestType: RssNodeType = 'food';
  let bestScore = -Infinity;

  for (const wT of wTemplates) {
    let wCross = 0;
    for (let i = 0; i < patchLen; i++) wCross += wBuf[i] * wT.centered[i];
    const wNcc = wNSq > 1 ? wCross / (wN * wT.norm + 1e-8) : 0;

    let eNcc = 0;
    const eT = eMap.get(wT.type);
    if (eT && eNSq > 1) {
      let eCross = 0;
      for (let i = 0; i < patchLen; i++) eCross += eBuf[i] * eT.centered[i];
      eNcc = eCross / (eN * eT.norm + 1e-8);
    }

    const score = (1 - edgeWeight) * wNcc + edgeWeight * eNcc;
    if (score > bestScore) {
      bestScore = score;
      bestType = wT.type;
    }
  }
  return bestType;
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
 * Detect RSS nodes using two-stage whiteness detection + combined NCC classification.
 *
 * Stage 1 — Detection (whiteness, 2x downscale):
 *   Uses averaged templates for fast NCC scanning to find candidate positions.
 *
 * Stage 2 — Classification (full-res whiteness + edge NCC):
 *   Combined whiteness and edge gradient template matching at full resolution.
 *   Edge templates capture internal icon structure for better type discrimination.
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

  // ── Build full-resolution whiteness + edge templates for Stage 2 classification ──
  const full = getFullResPixels(img);
  const fullWMap = buildWhitenessMap(full.pixels, full.w, full.h);
  const fullEdgeMap = computeEdgeMap(fullWMap, full.w, full.h);
  const fullWTemplates = buildTypedTemplates(
    accumulateTemplatePatches(fullWMap, full.w, full.h, annotations, FULL_TMPL_SIZE), FULL_TMPL_SIZE);
  const fullETemplates = buildTypedTemplates(
    accumulateTemplatePatches(fullEdgeMap, full.w, full.h, annotations, FULL_TMPL_SIZE), FULL_TMPL_SIZE);

  onProgress?.(`Built ${wTemplates.length} detection + ${fullWTemplates.length} full-res whiteness+edge templates, scanning ${w}x${h}...`);

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

  // ── Stage 2: Classify using full-resolution averaged template NCC ──
  const detectedNodes: DetectedPixelNode[] = [];

  for (let ci = 0; ci < kept.length; ci++) {
    const { x: sx, y: sy } = kept[ci];
    const gameX = Math.round((sx / w) * GAME_MAP_SIZE);
    const gameY = Math.round((1 - sy / h) * GAME_MAP_SIZE);

    // Classify at full resolution using combined whiteness + edge NCC
    const fullCx = Math.round((gameX / GAME_MAP_SIZE) * full.w);
    const fullCy = Math.round((1 - gameY / GAME_MAP_SIZE) * full.h);
    const bestType = fullWTemplates.length > 0
      ? classifyCombinedNcc(fullWMap, fullEdgeMap, full.w, full.h, fullCx, fullCy,
          fullWTemplates, fullETemplates, FULL_TMPL_SIZE, 0.5)
      : classifyByTemplateNcc(wMap, w, h, sx, sy, wTemplates, TMPL_SIZE);

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
 * Compares whiteness-only, edge-only, and combined NCC at multiple edge weights,
 * then uses the best-performing approach for actual classification.
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

  // ── Build full-resolution whiteness + edge maps ──
  onProgress?.('Building full-res whiteness + edge maps...');
  const full = getFullResPixels(img);
  const fullWMap = buildWhitenessMap(full.pixels, full.w, full.h);
  const fullEdgeMap = computeEdgeMap(fullWMap, full.w, full.h);

  // ── Build averaged templates for both channels ──
  onProgress?.('Building averaged templates...');
  const fullWTemplates = buildTypedTemplates(
    accumulateTemplatePatches(fullWMap, full.w, full.h, trainingNodes, FULL_TMPL_SIZE), FULL_TMPL_SIZE);
  const fullETemplates = buildTypedTemplates(
    accumulateTemplatePatches(fullEdgeMap, full.w, full.h, trainingNodes, FULL_TMPL_SIZE), FULL_TMPL_SIZE);

  // Log template stats
  for (const t of fullWTemplates) {
    const eT = fullETemplates.find(e => e.type === t.type);
    console.log(`[RSS] Template ${t.type}: wNorm=${t.norm.toFixed(1)}, eNorm=${eT?.norm.toFixed(1) ?? 'N/A'}`);
  }

  // ── Cross-validate: compare whiteness-only, edge-only, and combined at different weights ──
  const edgeWeights = [0.0, 0.25, 0.5, 0.75, 1.0];
  const cvScores: Record<string, { correct: number; total: number; confusion: Record<string, Record<string, number>> }> = {};

  for (const ew of edgeWeights) {
    const label = ew === 0 ? 'whiteness-only' : ew === 1 ? 'edge-only' : `combined(ew=${ew})`;
    const result = { correct: 0, total: 0, confusion: {} as Record<string, Record<string, number>> };

    for (const tn of trainingNodes) {
      const fullCx = Math.round((tn.x / GAME_MAP_SIZE) * full.w);
      const fullCy = Math.round((1 - tn.y / GAME_MAP_SIZE) * full.h);

      const pred = classifyCombinedNcc(
        fullWMap, fullEdgeMap, full.w, full.h, fullCx, fullCy,
        fullWTemplates, fullETemplates, FULL_TMPL_SIZE, ew);

      result.total++;
      if (pred === tn.type) result.correct++;
      if (!result.confusion[tn.type]) result.confusion[tn.type] = {};
      result.confusion[tn.type][pred] = (result.confusion[tn.type][pred] || 0) + 1;
    }

    cvScores[label] = result;
    console.log(`[RSS] CV ${label}: ${result.correct}/${result.total} = ${(result.correct / result.total * 100).toFixed(1)}%`);
  }

  // Find best edge weight
  let bestLabel = '';
  let bestCorrect = -1;
  let bestWeight = 0.5;
  for (const [label, r] of Object.entries(cvScores)) {
    if (r.correct > bestCorrect) {
      bestCorrect = r.correct;
      bestLabel = label;
      bestWeight = edgeWeights[Object.keys(cvScores).indexOf(label)];
    }
  }

  // Log confusion for best approach
  console.log(`[RSS] Best: ${bestLabel} (${bestCorrect}/${cvScores[bestLabel].total})`);
  console.log('[RSS] Confusion (true -> predicted):');
  for (const [trueType, preds] of Object.entries(cvScores[bestLabel].confusion)) {
    const parts = Object.entries(preds).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`);
    console.log(`  ${trueType} -> ${parts.join(', ')}`);
  }

  // ── Classify pending nodes using the best approach ──
  onProgress?.(`Re-classifying ${pendingNodes.length} nodes (${bestLabel})...`);
  const results: RssNodeType[] = [];

  for (let i = 0; i < pendingNodes.length; i++) {
    const node = pendingNodes[i];
    const fullCx = Math.round((node.x / GAME_MAP_SIZE) * full.w);
    const fullCy = Math.round((1 - node.y / GAME_MAP_SIZE) * full.h);

    results.push(classifyCombinedNcc(
      fullWMap, fullEdgeMap, full.w, full.h, fullCx, fullCy,
      fullWTemplates, fullETemplates, FULL_TMPL_SIZE, bestWeight));

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
