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

/** Size of the center patch used for color classification (in downscaled px) */
const COLOR_SAMPLE_RADIUS = 2; // 5x5 patch

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

/** Convert RGB [0-255] to HSL. Returns [hue 0-360, saturation 0-1, lightness 0-1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

/** Sample the average RGB of a center patch around (cx, cy) in the RGBA pixel array. */
function sampleCenterColor(
  pixels: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number, radius: number,
): { r: number; g: number; b: number } | null {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= w || py < 0 || py >= h) continue;
      const idx = (py * w + px) * 4;
      rSum += pixels[idx];
      gSum += pixels[idx + 1];
      bSum += pixels[idx + 2];
      count++;
    }
  }
  if (count === 0) return null;
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

/** Hue distance on the circular 0-360 scale. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

interface TypeColorProfile {
  type: RssNodeType;
  hue: number;
  saturation: number;
  lightness: number;
  count: number;
}

/** Classify a detected node by comparing its center color to per-type profiles. */
function classifyByColor(
  r: number, g: number, b: number,
  profiles: TypeColorProfile[],
): RssNodeType {
  const [h, s, l] = rgbToHsl(r, g, b);

  let bestType: RssNodeType = 'food';
  let bestScore = Infinity;

  for (const p of profiles) {
    // Stone is distinguished by low saturation; others by hue
    // Weighted distance: hue matters most, saturation helps separate stone from others
    const hDist = hueDist(h, p.hue);
    const sDist = Math.abs(s - p.saturation) * 180; // scale to comparable range
    const lDist = Math.abs(l - p.lightness) * 60;
    const score = hDist + sDist + lDist;
    if (score < bestScore) {
      bestScore = score;
      bestType = p.type;
    }
  }
  return bestType;
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
 * Stage 2 — Classification (color hue):
 *   6. Build per-type HSL color profiles from annotation center pixels
 *   7. Match each candidate's center color to nearest profile by hue/saturation
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

  // ── Build per-type color profiles from annotations (for classification) ──
  const colorProfiles: TypeColorProfile[] = [];
  const colorAccum: Record<string, { hSum: number; sSum: number; lSum: number; count: number }> = {};

  for (const ann of annotations) {
    const cx = Math.round((ann.x / GAME_MAP_SIZE) * w);
    const cy = Math.round((1 - ann.y / GAME_MAP_SIZE) * h);
    const color = sampleCenterColor(pixels, w, h, cx, cy, COLOR_SAMPLE_RADIUS);
    if (!color) continue;

    const [hue, sat, lit] = rgbToHsl(color.r, color.g, color.b);
    if (!colorAccum[ann.type]) {
      colorAccum[ann.type] = { hSum: 0, sSum: 0, lSum: 0, count: 0 };
    }
    const ca = colorAccum[ann.type];
    // Use sin/cos for circular hue averaging
    ca.hSum += hue; // simplified — works when samples are clustered
    ca.sSum += sat;
    ca.lSum += lit;
    ca.count++;
  }

  for (const [type, ca] of Object.entries(colorAccum)) {
    if (ca.count === 0) continue;
    colorProfiles.push({
      type: type as RssNodeType,
      hue: ca.hSum / ca.count,
      saturation: ca.sSum / ca.count,
      lightness: ca.lSum / ca.count,
      count: ca.count,
    });
  }

  onProgress?.(`Built ${wTemplates.length} detection + ${colorProfiles.length} color profiles, scanning ${w}x${h}...`);

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

  // ── Stage 2: Classify each kept detection using center-color hue matching ──
  const detectedNodes: DetectedPixelNode[] = [];

  for (let ci = 0; ci < kept.length; ci++) {
    const { x: sx, y: sy } = kept[ci];
    let bestType: RssNodeType = 'food';

    if (colorProfiles.length > 0) {
      const color = sampleCenterColor(pixels, w, h, sx, sy, COLOR_SAMPLE_RADIUS);
      if (color) {
        bestType = classifyByColor(color.r, color.g, color.b, colorProfiles);
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
