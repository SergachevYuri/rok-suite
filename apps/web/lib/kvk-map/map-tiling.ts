import { GAME_MAP_SIZE } from '@/lib/kvk-map-types';

export interface MapTile {
  base64: string;
  gridX: number;
  gridY: number;
}

/**
 * Load map image and split into a grid of JPEG tiles.
 * Returns base64-encoded JPEG for each tile.
 */
export async function splitMapIntoTiles(
  imageUrl: string,
  gridSize: number = 4,
): Promise<MapTile[]> {
  const img = await loadImage(imageUrl);
  const tilePixelSize = Math.ceil(img.width / gridSize);

  const tiles: MapTile[] = [];
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const canvas = document.createElement('canvas');
      canvas.width = tilePixelSize;
      canvas.height = tilePixelSize;
      const ctx = canvas.getContext('2d')!;
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
      // JPEG at 70% quality to keep payload reasonable
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const base64 = dataUrl.split(',')[1];
      tiles.push({ base64, gridX: gx, gridY: gy });
    }
  }
  return tiles;
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
 * The map image is `imageSize` px, split into `gridSize x gridSize` tiles.
 */
export function tileToMapCoords(
  gridX: number,
  gridY: number,
  nodePixelX: number,
  nodePixelY: number,
  tilePixelSize: number,
  imageSize: number,
): { x: number; y: number } {
  const pixelX = gridX * tilePixelSize + nodePixelX;
  const pixelY = gridY * tilePixelSize + nodePixelY;
  return {
    x: Math.round((pixelX / imageSize) * GAME_MAP_SIZE),
    y: Math.round((pixelY / imageSize) * GAME_MAP_SIZE),
  };
}
