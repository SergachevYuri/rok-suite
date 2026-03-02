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

/** Template patch size at full resolution for high-detail classification */
const FULL_TMPL_SIZE = 24;

/** Fraction of each type's training patches to use as K in balanced KNN */
const KNN_PCT = 0.03;
/** Minimum K per type (ensures enough neighbors even for small types) */
const KNN_MIN_K = 3;

/** Compute per-type K values: top KNN_PCT of each type, min KNN_MIN_K */
function computePerTypeK(typeCounts: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [type, count] of Object.entries(typeCounts)) {
    result[type] = Math.max(KNN_MIN_K, Math.round(count * KNN_PCT));
  }
  return result;
}


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

/** Whiteness template with type info preserved for shape-based classification */
interface TypedTemplate {
  type: RssNodeType;
  centered: Float32Array;
  norm: number;
}

/** Accumulator with sum and sum-of-squares for Fisher discriminant computation */
interface PatchAccumulator {
  data: Float32Array;     // sum of pixel values
  dataSq: Float32Array;   // sum of squared pixel values
  count: number;
}

/** A stored training patch: centered, optionally weighted, and unit-normalized */
interface StoredPatch {
  type: RssNodeType;
  data: Float32Array; // unit-normalized (dot product = NCC)
}

/**
 * Accumulate whiteness patches from annotations into per-type accumulators.
 * Tracks both sum and sum-of-squares for Fisher discriminant weight computation.
 */
function accumulateTemplatePatches(
  wMap: Float32Array, w: number, h: number,
  annotations: AnnotationSample[],
  tmplSize = TMPL_SIZE,
): Record<string, PatchAccumulator> {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const typeAccum: Record<string, PatchAccumulator> = {};
  const tmpBuf = new Float32Array(patchLen);

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - ann.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, tmpBuf)) continue;

    if (!typeAccum[ann.type]) {
      typeAccum[ann.type] = {
        data: new Float32Array(patchLen),
        dataSq: new Float32Array(patchLen),
        count: 0,
      };
    }
    const acc = typeAccum[ann.type];
    for (let i = 0; i < patchLen; i++) {
      acc.data[i] += tmpBuf[i];
      acc.dataSq[i] += tmpBuf[i] * tmpBuf[i];
    }
    acc.count++;
  }
  return typeAccum;
}

/**
 * Build Fisher discriminant weights from accumulated patch statistics.
 * For each pixel position, weight = between-class variance / within-class variance.
 * High-weight pixels are where icon types actually differ; low-weight pixels are
 * where all types look the same (e.g., background, generic blob center).
 */
function buildDiscriminantWeights(
  typeAccum: Record<string, PatchAccumulator>,
  patchLen: number,
): Float32Array {
  const weights = new Float32Array(patchLen);
  const types = Object.values(typeAccum).filter(a => a.count > 0);
  if (types.length < 2) { weights.fill(1); return weights; }

  const totalCount = types.reduce((s, a) => s + a.count, 0);

  for (let i = 0; i < patchLen; i++) {
    let globalSum = 0;
    for (const t of types) globalSum += t.data[i];
    const globalMean = globalSum / totalCount;

    let betweenVar = 0;
    for (const t of types) {
      const typeMean = t.data[i] / t.count;
      const diff = typeMean - globalMean;
      betweenVar += (t.count / totalCount) * diff * diff;
    }

    let withinVar = 0;
    for (const t of types) {
      const typeMean = t.data[i] / t.count;
      const typeVar = t.dataSq[i] / t.count - typeMean * typeMean;
      withinVar += (t.count / totalCount) * Math.max(0, typeVar);
    }

    weights[i] = betweenVar / (withinVar + 1);
  }

  let wSum = 0;
  for (let i = 0; i < patchLen; i++) wSum += weights[i];
  if (wSum > 0) {
    const scale = patchLen / wSum;
    for (let i = 0; i < patchLen; i++) weights[i] *= scale;
  }

  return weights;
}

/**
 * Build per-type averaged whiteness templates from accumulated patch data.
 * When discriminant weights are provided, applies sqrt(w_i) to each pixel
 * position after mean-centering, so NCC naturally emphasizes discriminative pixels.
 */
function buildTypedTemplates(
  typeAccum: Record<string, PatchAccumulator>,
  tmplSize = TMPL_SIZE,
  discrimWeights?: Float32Array,
): TypedTemplate[] {
  const patchLen = tmplSize * tmplSize;
  const templates: TypedTemplate[] = [];

  let sqrtW: Float32Array | undefined;
  if (discrimWeights) {
    sqrtW = new Float32Array(patchLen);
    for (let i = 0; i < patchLen; i++) sqrtW[i] = Math.sqrt(discrimWeights[i]);
  }

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
      let v = avg[i] - mean;
      if (sqrtW) v *= sqrtW[i];
      centered[i] = v;
      normSq += v * v;
    }
    templates.push({ type: type as RssNodeType, centered, norm: Math.sqrt(normSq) });
  }
  return templates;
}

/**
 * Classify a position using Fisher-weighted averaged template NCC.
 */
function classifyByTemplateNcc(
  wMap: Float32Array, w: number, h: number,
  cx: number, cy: number,
  templates: TypedTemplate[],
  tmplSize: number,
  discrimWeights?: Float32Array,
): RssNodeType {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const patchBuf = new Float32Array(patchLen);

  if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, patchBuf)) return 'food';

  let patchMean = 0;
  for (let i = 0; i < patchLen; i++) patchMean += patchBuf[i];
  patchMean /= patchLen;

  let patchNormSq = 0;
  if (discrimWeights) {
    for (let i = 0; i < patchLen; i++) {
      const v = (patchBuf[i] - patchMean) * Math.sqrt(discrimWeights[i]);
      patchBuf[i] = v;
      patchNormSq += v * v;
    }
  } else {
    for (let i = 0; i < patchLen; i++) {
      patchBuf[i] -= patchMean;
      patchNormSq += patchBuf[i] * patchBuf[i];
    }
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
 * Extract all training patches as unit-normalized vectors.
 * Each patch is mean-centered, optionally Fisher-weighted, then divided by its norm.
 * Dot product between two unit-normalized patches equals their NCC.
 */
function buildTrainingPatches(
  wMap: Float32Array, w: number, h: number,
  trainingNodes: AnnotationSample[],
  tmplSize: number,
  discrimWeights?: Float32Array,
): StoredPatch[] {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const patches: StoredPatch[] = [];
  const buf = new Float32Array(patchLen);

  let sqrtW: Float32Array | undefined;
  if (discrimWeights) {
    sqrtW = new Float32Array(patchLen);
    for (let i = 0; i < patchLen; i++) sqrtW[i] = Math.sqrt(discrimWeights[i]);
  }

  for (const tn of trainingNodes) {
    const cx = Math.round((tn.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - tn.y / GAME_MAP_SIZE) * h);
    if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, buf)) continue;

    let mean = 0;
    for (let i = 0; i < patchLen; i++) mean += buf[i];
    mean /= patchLen;

    const data = new Float32Array(patchLen);
    let normSq = 0;
    for (let i = 0; i < patchLen; i++) {
      let v = buf[i] - mean;
      if (sqrtW) v *= sqrtW[i];
      data[i] = v;
      normSq += v * v;
    }
    if (normSq < 1) continue;
    const norm = Math.sqrt(normSq);
    for (let i = 0; i < patchLen; i++) data[i] /= norm;

    patches.push({ type: tn.type, data });
  }

  return patches;
}

/**
 * Compute N×N pairwise NCC matrix for stored training patches.
 * Since patches are unit-normalized, NCC = dot product.
 */
function computePairwiseNcc(patches: StoredPatch[], patchLen: number): Float32Array {
  const N = patches.length;
  const matrix = new Float32Array(N * N);

  for (let i = 0; i < N; i++) {
    matrix[i * N + i] = 1.0;
    const pi = patches[i].data;
    for (let j = i + 1; j < N; j++) {
      const pj = patches[j].data;
      let dot = 0;
      for (let k = 0; k < patchLen; k++) dot += pi[k] * pj[k];
      matrix[i * N + j] = dot;
      matrix[j * N + i] = dot;
    }
  }

  return matrix;
}

/**
 * Compute per-type self-similarity baselines from pairwise NCC matrix.
 * For each type, measures the average top-K NCC that its own patches achieve
 * against each other. Used to normalize KNN scores so types with inherently
 * high self-similarity (few diverse patches) don't get unfair advantage.
 */
function computeTypeBaselines(
  patches: StoredPatch[],
  nccMatrix: Float32Array,
  perTypeK: Record<string, number>,
): Record<string, number> {
  const N = patches.length;
  const typeIndices: Record<string, number[]> = {};
  for (let i = 0; i < N; i++) {
    const t = patches[i].type;
    if (!typeIndices[t]) typeIndices[t] = [];
    typeIndices[t].push(i);
  }

  const baselines: Record<string, number> = {};
  for (const [type, indices] of Object.entries(typeIndices)) {
    const K = perTypeK[type] ?? KNN_MIN_K;
    let totalAvg = 0;
    let count = 0;
    for (const i of indices) {
      const scores: number[] = [];
      for (const j of indices) {
        if (j === i) continue;
        scores.push(nccMatrix[i * N + j]);
      }
      if (scores.length === 0) continue;
      scores.sort((a, b) => b - a);
      const topK = Math.min(K, scores.length);
      let sum = 0;
      for (let k = 0; k < topK; k++) sum += scores[k];
      totalAvg += sum / topK;
      count++;
    }
    baselines[type] = count > 0 ? totalAvg / count : 1;
  }
  return baselines;
}

/**
 * Compute balanced accuracy from a confusion matrix.
 * Average of per-class recall — gives equal weight to each class regardless
 * of how many training samples it has. Prevents majority classes from
 * dominating the evaluation metric.
 */
function balancedAccuracy(confusion: Record<string, Record<string, number>>): number {
  let totalRecall = 0;
  let numTypes = 0;
  for (const [trueType, preds] of Object.entries(confusion)) {
    let classTotal = 0;
    let classCorrect = 0;
    for (const [predType, count] of Object.entries(preds)) {
      classTotal += count;
      if (predType === trueType) classCorrect = count;
    }
    if (classTotal > 0) {
      totalRecall += classCorrect / classTotal;
      numTypes++;
    }
  }
  return numTypes > 0 ? totalRecall / numTypes : 0;
}

/**
 * Leave-one-out cross-validation for balanced KNN using pre-computed pairwise NCC.
 * Normalizes each type's top-K average by its self-similarity baseline to prevent
 * types with few homogeneous patches from being over-predicted.
 */
function knnLoocvAccuracy(
  patches: StoredPatch[],
  nccMatrix: Float32Array,
  perTypeK: Record<string, number>,
  baselines: Record<string, number>,
): { correct: number; total: number; confusion: Record<string, Record<string, number>> } {
  const N = patches.length;
  let correct = 0;
  let total = 0;
  const confusion: Record<string, Record<string, number>> = {};

  const typeIndices: Record<string, number[]> = {};
  for (let i = 0; i < N; i++) {
    const t = patches[i].type;
    if (!typeIndices[t]) typeIndices[t] = [];
    typeIndices[t].push(i);
  }

  for (let i = 0; i < N; i++) {
    let bestType: RssNodeType = 'food';
    let bestScore = -Infinity;

    for (const [type, indices] of Object.entries(typeIndices)) {
      const K = perTypeK[type] ?? KNN_MIN_K;
      const scores: number[] = [];
      for (const j of indices) {
        if (j === i) continue;
        scores.push(nccMatrix[i * N + j]);
      }
      if (scores.length === 0) continue;

      scores.sort((a, b) => b - a);
      const topK = Math.min(K, scores.length);
      let sum = 0;
      for (let k = 0; k < topK; k++) sum += scores[k];
      const avg = sum / topK;

      const baseline = baselines[type] ?? 1;
      const normalizedScore = avg / (baseline + 1e-8);

      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestType = type as RssNodeType;
      }
    }

    total++;
    if (bestType === patches[i].type) correct++;
    const trueType = patches[i].type;
    if (!confusion[trueType]) confusion[trueType] = {};
    confusion[trueType][bestType] = (confusion[trueType][bestType] || 0) + 1;
  }

  return { correct, total, confusion };
}

/**
 * Classify a patch using baseline-normalized balanced KNN.
 * For each type, finds the K nearest training patches (highest NCC),
 * averages their scores, divides by the type's self-similarity baseline,
 * and picks the type with the highest normalized score.
 */
function classifyByBalancedKnn(
  wMap: Float32Array, w: number, h: number,
  cx: number, cy: number,
  trainingPatches: StoredPatch[],
  tmplSize: number,
  perTypeK: Record<string, number>,
  baselines: Record<string, number>,
  discrimWeights?: Float32Array,
): RssNodeType {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const buf = new Float32Array(patchLen);

  if (!extractPatch(wMap, w, h, cx, cy, half, tmplSize, buf)) return 'food';

  // Mean-center, optionally weight, normalize
  let mean = 0;
  for (let i = 0; i < patchLen; i++) mean += buf[i];
  mean /= patchLen;

  let normSq = 0;
  if (discrimWeights) {
    for (let i = 0; i < patchLen; i++) {
      const v = (buf[i] - mean) * Math.sqrt(discrimWeights[i]);
      buf[i] = v;
      normSq += v * v;
    }
  } else {
    for (let i = 0; i < patchLen; i++) {
      buf[i] -= mean;
      normSq += buf[i] * buf[i];
    }
  }
  if (normSq < 1) return 'food';
  const norm = Math.sqrt(normSq);
  for (let i = 0; i < patchLen; i++) buf[i] /= norm;

  // Compute NCC against all training patches, maintain top-K per type
  const typeTopK: Record<string, number[]> = {};
  for (const tp of trainingPatches) {
    let dot = 0;
    for (let i = 0; i < patchLen; i++) dot += buf[i] * tp.data[i];

    if (!typeTopK[tp.type]) typeTopK[tp.type] = [];
    const scores = typeTopK[tp.type];

    const typeK = perTypeK[tp.type] ?? KNN_MIN_K;
    if (scores.length < typeK) {
      scores.push(dot);
      for (let j = scores.length - 1; j > 0 && scores[j] > scores[j - 1]; j--) {
        const tmp = scores[j]; scores[j] = scores[j - 1]; scores[j - 1] = tmp;
      }
    } else if (dot > scores[typeK - 1]) {
      scores[typeK - 1] = dot;
      for (let j = typeK - 1; j > 0 && scores[j] > scores[j - 1]; j--) {
        const tmp = scores[j]; scores[j] = scores[j - 1]; scores[j - 1] = tmp;
      }
    }
  }

  // Pick type with highest baseline-normalized average top-K score
  let bestType: RssNodeType = 'food';
  let bestAvg = -Infinity;
  for (const [type, scores] of Object.entries(typeTopK)) {
    let sum = 0;
    for (let i = 0; i < scores.length; i++) sum += scores[i];
    const avg = sum / scores.length;
    const baseline = baselines[type] ?? 1;
    const normalizedAvg = avg / (baseline + 1e-8);
    if (normalizedAvg > bestAvg) {
      bestAvg = normalizedAvg;
      bestType = type as RssNodeType;
    }
  }

  return bestType;
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
 * Load full-resolution pixel data from an image element.
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
 * Efficient leave-one-out cross-validation for averaged template NCC.
 */
function loocvAccuracy(
  wMap: Float32Array, mapW: number, mapH: number,
  trainingNodes: AnnotationSample[],
  typeAccum: Record<string, PatchAccumulator>,
  tmplSize: number,
  discrimWeights?: Float32Array,
): { correct: number; total: number; confusion: Record<string, Record<string, number>> } {
  const patchLen = tmplSize * tmplSize;
  const half = Math.floor(tmplSize / 2);
  const patchBuf = new Float32Array(patchLen);

  let sqrtW: Float32Array | undefined;
  if (discrimWeights) {
    sqrtW = new Float32Array(patchLen);
    for (let i = 0; i < patchLen; i++) sqrtW[i] = Math.sqrt(discrimWeights[i]);
  }

  const allTemplates = buildTypedTemplates(typeAccum, tmplSize, discrimWeights);

  let correct = 0;
  let total = 0;
  const confusion: Record<string, Record<string, number>> = {};

  for (const tn of trainingNodes) {
    const cx = Math.round((tn.x / GAME_MAP_SIZE) * mapW);
    const cy = Math.round((1 - tn.y / GAME_MAP_SIZE) * mapH);
    if (!extractPatch(wMap, mapW, mapH, cx, cy, half, tmplSize, patchBuf)) continue;

    const acc = typeAccum[tn.type];
    if (!acc || acc.count <= 1) continue;

    const looAvg = new Float32Array(patchLen);
    for (let i = 0; i < patchLen; i++) {
      looAvg[i] = (acc.data[i] - patchBuf[i]) / (acc.count - 1);
    }
    let looMean = 0;
    for (let i = 0; i < patchLen; i++) looMean += looAvg[i];
    looMean /= patchLen;

    const looCentered = new Float32Array(patchLen);
    let looNormSq = 0;
    for (let i = 0; i < patchLen; i++) {
      let v = looAvg[i] - looMean;
      if (sqrtW) v *= sqrtW[i];
      looCentered[i] = v;
      looNormSq += v * v;
    }
    const looTemplate: TypedTemplate = {
      type: tn.type,
      centered: looCentered,
      norm: Math.sqrt(looNormSq),
    };

    let pMean = 0;
    for (let i = 0; i < patchLen; i++) pMean += patchBuf[i];
    pMean /= patchLen;

    const centeredPatch = new Float32Array(patchLen);
    let pNormSq = 0;
    for (let i = 0; i < patchLen; i++) {
      let v = patchBuf[i] - pMean;
      if (sqrtW) v *= sqrtW[i];
      centeredPatch[i] = v;
      pNormSq += v * v;
    }
    if (pNormSq < 1) continue;
    const pNorm = Math.sqrt(pNormSq);

    let bestType: RssNodeType = 'food';
    let bestScore = -1;

    for (const tmpl of allTemplates) {
      const useTemplate = tmpl.type === tn.type ? looTemplate : tmpl;
      let cross = 0;
      for (let i = 0; i < patchLen; i++) cross += centeredPatch[i] * useTemplate.centered[i];
      const ncc = cross / (pNorm * useTemplate.norm + 1e-8);
      if (ncc > bestScore) {
        bestScore = ncc;
        bestType = useTemplate.type;
      }
    }

    total++;
    if (bestType === tn.type) correct++;
    if (!confusion[tn.type]) confusion[tn.type] = {};
    confusion[tn.type][bestType] = (confusion[tn.type][bestType] || 0) + 1;
  }

  return { correct, total, confusion };
}

/**
 * Detect RSS nodes using two-stage detection + Fisher-weighted NCC classification.
 *
 * Stage 1 — Detection (whiteness, 2x downscale):
 *   Uses averaged templates for fast NCC scanning to find candidate positions.
 *
 * Stage 2 — Classification (Fisher-weighted NCC):
 *   Applies per-pixel discrimination weights that emphasize pixels where icon
 *   types actually differ, improving discrimination between similar white blobs.
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

  onProgress?.('Computing whiteness map...');
  const wMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    wMap[i] = pixelWhiteness(dsPixels[idx], dsPixels[idx + 1], dsPixels[idx + 2]);
  }

  onProgress?.('Building detection templates...');
  const patchLen = TMPL_SIZE * TMPL_SIZE;
  const half = Math.floor(TMPL_SIZE / 2);
  const typeAccum = accumulateTemplatePatches(wMap, w, h, annotations);
  const detectTemplates = buildTypedTemplates(typeAccum);

  if (detectTemplates.length === 0) {
    onProgress?.('No valid templates — annotations may be outside image');
    return [];
  }

  const dsWeights = buildDiscriminantWeights(typeAccum, patchLen);
  const classTemplates = buildTypedTemplates(typeAccum, TMPL_SIZE, dsWeights);

  onProgress?.(`Built ${detectTemplates.length} detection + ${classTemplates.length} Fisher-weighted templates, scanning ${w}x${h}...`);

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
      for (const tmpl of detectTemplates) {
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

  // ── Stage 2: Classify using Fisher-weighted NCC ──
  const detectedNodes: DetectedPixelNode[] = [];

  for (let ci = 0; ci < kept.length; ci++) {
    const { x: sx, y: sy } = kept[ci];
    const gameX = Math.round((sx / w) * GAME_MAP_SIZE);
    const gameY = Math.round((1 - sy / h) * GAME_MAP_SIZE);

    const bestType = classifyByTemplateNcc(
      wMap, w, h, sx, sy, classTemplates, TMPL_SIZE, dsWeights);

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
 * Compares multiple approaches via LOOCV (using balanced accuracy) and auto-selects:
 *   - Averaged template NCC (plain and Fisher-weighted, at both resolutions)
 *   - Balanced KNN with baseline normalization: divides each type's top-K NCC
 *     by its self-similarity to prevent homogeneous types from being over-predicted
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

  // ── Build downscaled whiteness map ──
  const dsW = Math.round(img.width / SCALE);
  const dsH = Math.round(img.height / SCALE);
  const dsCanvas = document.createElement('canvas');
  dsCanvas.width = dsW;
  dsCanvas.height = dsH;
  const dsCtx = dsCanvas.getContext('2d')!;
  dsCtx.drawImage(img, 0, 0, dsW, dsH);
  const dsPixels = dsCtx.getImageData(0, 0, dsW, dsH).data;
  const dsWMap = buildWhitenessMap(dsPixels, dsW, dsH);

  // ── Build full-resolution whiteness map ──
  const full = getFullResPixels(img);
  const fullWMap = buildWhitenessMap(full.pixels, full.w, full.h);

  // ── Accumulate patches at both resolutions ──
  onProgress?.('Building templates at both resolutions...');
  const dsAccum = accumulateTemplatePatches(dsWMap, dsW, dsH, trainingNodes, TMPL_SIZE);
  const fullAccum = accumulateTemplatePatches(fullWMap, full.w, full.h, trainingNodes, FULL_TMPL_SIZE);

  // ── Build Fisher discriminant weights ──
  const dsPatchLen = TMPL_SIZE * TMPL_SIZE;
  const fullPatchLen = FULL_TMPL_SIZE * FULL_TMPL_SIZE;
  const dsWeights = buildDiscriminantWeights(dsAccum, dsPatchLen);
  const fullWeights = buildDiscriminantWeights(fullAccum, fullPatchLen);

  // ── Cross-validate averaged template approaches via LOOCV ──
  onProgress?.('Running LOOCV (averaged templates)...');

  interface CvResult {
    correct: number;
    total: number;
    confusion: Record<string, Record<string, number>>;
    balancedAcc: number;
  }

  const cvResults: Record<string, CvResult> = {};
  const avgApproaches = [
    { label: 'avg-ds-plain', map: dsWMap, w: dsW, h: dsH, accum: dsAccum, size: TMPL_SIZE, weights: undefined as Float32Array | undefined },
    { label: 'avg-ds-fisher', map: dsWMap, w: dsW, h: dsH, accum: dsAccum, size: TMPL_SIZE, weights: dsWeights as Float32Array | undefined },
    { label: 'avg-full-plain', map: fullWMap, w: full.w, h: full.h, accum: fullAccum, size: FULL_TMPL_SIZE, weights: undefined as Float32Array | undefined },
    { label: 'avg-full-fisher', map: fullWMap, w: full.w, h: full.h, accum: fullAccum, size: FULL_TMPL_SIZE, weights: fullWeights as Float32Array | undefined },
  ];

  for (const a of avgApproaches) {
    const cv = loocvAccuracy(a.map, a.w, a.h, trainingNodes, a.accum, a.size, a.weights);
    const bAcc = balancedAccuracy(cv.confusion);
    cvResults[a.label] = { ...cv, balancedAcc: bAcc };
    const rawPct = cv.total > 0 ? (cv.correct / cv.total * 100).toFixed(1) : '0.0';
    console.log(`[RSS] LOOCV ${a.label}: ${cv.correct}/${cv.total} = ${rawPct}% raw, ${(bAcc * 100).toFixed(1)}% balanced`);
  }

  // ── Cross-validate balanced KNN approaches ──
  onProgress?.('Running LOOCV (balanced KNN)...');

  const knnConfigs = [
    { label: 'knn-ds-plain', map: dsWMap, w: dsW, h: dsH, size: TMPL_SIZE, patchLen: dsPatchLen, weights: undefined as Float32Array | undefined },
    { label: 'knn-ds-fisher', map: dsWMap, w: dsW, h: dsH, size: TMPL_SIZE, patchLen: dsPatchLen, weights: dsWeights as Float32Array | undefined },
    { label: 'knn-full-plain', map: fullWMap, w: full.w, h: full.h, size: FULL_TMPL_SIZE, patchLen: fullPatchLen, weights: undefined as Float32Array | undefined },
    { label: 'knn-full-fisher', map: fullWMap, w: full.w, h: full.h, size: FULL_TMPL_SIZE, patchLen: fullPatchLen, weights: fullWeights as Float32Array | undefined },
  ];

  const knnData: Record<string, { patches: StoredPatch[]; baselines: Record<string, number>; perTypeK: Record<string, number> }> = {};

  for (const cfg of knnConfigs) {
    const patches = buildTrainingPatches(cfg.map, cfg.w, cfg.h, trainingNodes, cfg.size, cfg.weights);
    const typeCounts: Record<string, number> = {};
    for (const p of patches) typeCounts[p.type] = (typeCounts[p.type] ?? 0) + 1;
    const perTypeK = computePerTypeK(typeCounts);
    const matrix = computePairwiseNcc(patches, cfg.patchLen);
    const baselines = computeTypeBaselines(patches, matrix, perTypeK);
    knnData[cfg.label] = { patches, baselines, perTypeK };

    // Log baselines
    const blParts = Object.entries(baselines).map(([t, v]) => `${t}:${v.toFixed(4)}`).join(', ');
    console.log(`[RSS] Baselines ${cfg.label}: ${blParts}`);

    const cv = knnLoocvAccuracy(patches, matrix, perTypeK, baselines);
    const bAcc = balancedAccuracy(cv.confusion);
    cvResults[cfg.label] = { ...cv, balancedAcc: bAcc };
    const rawPct = cv.total > 0 ? (cv.correct / cv.total * 100).toFixed(1) : '0.0';
    console.log(`[RSS] LOOCV ${cfg.label}: ${cv.correct}/${cv.total} = ${rawPct}% raw, ${(bAcc * 100).toFixed(1)}% balanced`);

    await new Promise((r) => setTimeout(r, 0));
  }

  // ── Find best approach by balanced accuracy ──
  let bestLabel = '';
  let bestBalancedAcc = -1;

  for (const [label, cv] of Object.entries(cvResults)) {
    if (cv.balancedAcc > bestBalancedAcc) {
      bestBalancedAcc = cv.balancedAcc;
      bestLabel = label;
    }
  }

  const bestCv = cvResults[bestLabel];
  console.log(`[RSS] Best: ${bestLabel} (balanced=${(bestCv.balancedAcc * 100).toFixed(1)}%, raw=${bestCv.correct}/${bestCv.total})`);
  console.log('[RSS] Confusion (true -> predicted):');
  for (const [trueType, preds] of Object.entries(bestCv.confusion)) {
    const parts = Object.entries(preds).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`);
    console.log(`  ${trueType} -> ${parts.join(', ')}`);
  }

  // ── Classify pending nodes using the best approach ──
  onProgress?.(`Re-classifying ${pendingNodes.length} nodes (${bestLabel})...`);
  const results: RssNodeType[] = [];

  const isKnn = bestLabel.startsWith('knn-');

  if (isKnn) {
    const cfg = knnConfigs.find(c => c.label === bestLabel)!;
    const { patches: trainPatches, baselines, perTypeK } = knnData[bestLabel];

    for (let i = 0; i < pendingNodes.length; i++) {
      const node = pendingNodes[i];
      const cx = Math.round((node.x / GAME_MAP_SIZE) * cfg.w);
      const cy = Math.round((1 - node.y / GAME_MAP_SIZE) * cfg.h);

      results.push(classifyByBalancedKnn(
        cfg.map, cfg.w, cfg.h, cx, cy, trainPatches, cfg.size, perTypeK, baselines, cfg.weights));

      if (i % 200 === 0 && i > 0) {
        onProgress?.(`Re-classifying... ${Math.round((i / pendingNodes.length) * 100)}%`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } else {
    const cfg = avgApproaches.find(a => a.label === bestLabel)!;
    const finalTemplates = buildTypedTemplates(cfg.accum, cfg.size, cfg.weights);

    for (let i = 0; i < pendingNodes.length; i++) {
      const node = pendingNodes[i];
      const cx = Math.round((node.x / GAME_MAP_SIZE) * cfg.w);
      const cy = Math.round((1 - node.y / GAME_MAP_SIZE) * cfg.h);

      results.push(classifyByTemplateNcc(
        cfg.map, cfg.w, cfg.h, cx, cy, finalTemplates, cfg.size, cfg.weights));

      if (i % 200 === 0 && i > 0) {
        onProgress?.(`Re-classifying... ${Math.round((i / pendingNodes.length) * 100)}%`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  onProgress?.(`Re-classified ${results.length} nodes`);
  return results;
}

/**
 * Pre-filter: is there a bright white blob at (cx,cy) that stands out from
 * its surroundings?
 */
function hasBrightBlob(wMap: Float32Array, w: number, cx: number, cy: number): boolean {
  let centerSum = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      centerSum += wMap[(cy + dy) * w + (cx + dx)];
    }
  }
  const centerAvg = centerSum / 9;
  if (centerAvg < CENTER_WHITENESS_MIN) return false;

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
