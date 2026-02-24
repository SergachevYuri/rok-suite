import { GAME_MAP_SIZE } from '@/lib/kvk-map-types';

export interface MapTile {
  base64: string;
  gridX: number;
  gridY: number;
}

/** Target size for the downscaled image before tiling */
const SCALED_SIZE = 2048;

/**
 * Load map image, downscale it, and split into a grid of JPEG tiles.
 * Returns base64-encoded JPEG for each tile plus the scaled image dimensions.
 */
export async function splitMapIntoTiles(
  imageUrl: string,
  gridSize: number = 4,
  onProgress?: (msg: string) => void,
): Promise<{ tiles: MapTile[]; scaledSize: number; tilePixelSize: number }> {
  onProgress?.('Loading map image...');
  const img = await loadImage(imageUrl);

  // Downscale the full image first
  onProgress?.(`Downscaling ${img.width}x${img.height} → ${SCALED_SIZE}x${SCALED_SIZE}...`);
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = SCALED_SIZE;
  scaledCanvas.height = SCALED_SIZE;
  const scaledCtx = scaledCanvas.getContext('2d')!;
  scaledCtx.drawImage(img, 0, 0, SCALED_SIZE, SCALED_SIZE);

  const tilePixelSize = Math.ceil(SCALED_SIZE / gridSize);

  onProgress?.(`Splitting into ${gridSize}x${gridSize} tiles...`);
  const tiles: MapTile[] = [];
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tilePixelSize;
      tileCanvas.height = tilePixelSize;
      const ctx = tileCanvas.getContext('2d')!;
      ctx.drawImage(
        scaledCanvas,
        gx * tilePixelSize,
        gy * tilePixelSize,
        tilePixelSize,
        tilePixelSize,
        0,
        0,
        tilePixelSize,
        tilePixelSize,
      );
      const dataUrl = tileCanvas.toDataURL('image/jpeg', 0.75);
      const base64 = dataUrl.split(',')[1];
      tiles.push({ base64, gridX: gx, gridY: gy });
    }
  }

  return { tiles, scaledSize: SCALED_SIZE, tilePixelSize };
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

/**
 * Convert tile-relative pixel coordinates to game map coordinates (0–GAME_MAP_SIZE).
 */
export function tileToMapCoords(
  gridX: number,
  gridY: number,
  nodePixelX: number,
  nodePixelY: number,
  tilePixelSize: number,
  scaledSize: number,
): { x: number; y: number } {
  const pixelX = gridX * tilePixelSize + nodePixelX;
  const pixelY = gridY * tilePixelSize + nodePixelY;
  return {
    x: Math.round((pixelX / scaledSize) * GAME_MAP_SIZE),
    y: Math.round((pixelY / scaledSize) * GAME_MAP_SIZE),
  };
}
