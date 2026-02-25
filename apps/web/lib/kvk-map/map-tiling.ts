import { GAME_MAP_SIZE } from '@/lib/kvk-map-types';

export interface MapTile {
  base64: string;
  gridX: number;
  gridY: number;
}

/**
 * Load map image and split into a grid of JPEG tiles at full resolution.
 * Returns base64-encoded JPEG for each tile plus the image dimensions.
 */
export async function splitMapIntoTiles(
  imageUrl: string,
  gridSize: number = 8,
  onProgress?: (msg: string) => void,
): Promise<{ tiles: MapTile[]; scaledSize: number; tilePixelSize: number }> {
  onProgress?.('Loading map image...');
  const img = await loadImage(imageUrl);

  // Use the full image resolution (no downscaling) for better node detection
  const fullSize = img.width;
  const tilePixelSize = Math.ceil(fullSize / gridSize);

  onProgress?.(`Splitting ${fullSize}x${fullSize} into ${gridSize}x${gridSize} tiles (${tilePixelSize}px each)...`);
  const tiles: MapTile[] = [];
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tilePixelSize;
      tileCanvas.height = tilePixelSize;
      const ctx = tileCanvas.getContext('2d')!;
      ctx.drawImage(
        img,
        gx * tilePixelSize,
        gy * tilePixelSize,
        tilePixelSize,
        tilePixelSize,
        0,
        0,
        tilePixelSize,
        tilePixelSize,
      );
      const dataUrl = tileCanvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      tiles.push({ base64, gridX: gx, gridY: gy });
    }
  }

  return { tiles, scaledSize: fullSize, tilePixelSize };
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
