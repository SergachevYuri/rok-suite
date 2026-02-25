import { NextRequest, NextResponse } from 'next/server';

// Allow up to 60 seconds for Claude Vision API calls on Vercel
export const maxDuration = 60;

interface AnnotationInput {
  x: number;
  y: number;
  type: string;
}

interface DetectedNode {
  x: number;
  y: number;
  type: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a computer vision specialist analyzing sections of a Rise of Kingdoms KvK (Kingdom vs Kingdom) map. Your task is to identify resource nodes (RSS nodes) in the image.

Resource nodes appear as small glowing circles/orbs (roughly 10-30 pixels diameter at this zoom level) scattered across the map terrain. Each type has a distinct color:
- food: bright green glowing orbs
- wood: brownish/orange/dark yellow glowing orbs
- stone: gray/silver glowing orbs
- gold: bright yellow/golden glowing orbs
- crystal: purple/violet/pink glowing orbs

These nodes have a characteristic bright glow/halo effect and are scattered randomly across the map terrain (grass, sand, snow areas). They are NOT:
- Buildings, cities, or large structures
- UI elements, text, or labels
- Terrain features like rocks or trees
- Zone borders or lines

Each node is a small distinct circular bright spot. Look carefully for these glowing dots across the entire tile. There may be dozens per tile or none at all depending on the area.

IMPORTANT: Only report nodes you are confident about. It's better to miss some than to report false positives.`;

function buildTilePrompt(
  tilePixelSize: number,
  annotations: AnnotationInput[],
): string {
  let prompt = `Analyze this map tile (${tilePixelSize}x${tilePixelSize} pixels) and identify all resource nodes visible.

Return a JSON array of detected nodes. Each node should have:
- "x": horizontal pixel position within this tile (0 to ${tilePixelSize})
- "y": vertical pixel position within this tile (0 to ${tilePixelSize})
- "type": one of "food", "wood", "stone", "gold", "crystal"
- "confidence": 0.0 to 1.0 how confident you are

Only include nodes with confidence >= 0.5. Return ONLY the JSON array, no other text.`;

  if (annotations.length > 0) {
    prompt += `\n\nHere are example nodes the user has already identified in this tile (pixel coordinates within this tile):`;
    for (const ann of annotations) {
      prompt += `\n- ${ann.type} node at pixel (${ann.x}, ${ann.y})`;
    }
    prompt += `\nUse these as reference for what the nodes look like. Find additional nodes similar to these, as well as any other resource nodes you can see.`;
  }

  prompt += `\n\nRespond with ONLY a JSON array like: [{"x": 100, "y": 200, "type": "food", "confidence": 0.8}]
If no nodes are found, respond with: []`;

  return prompt;
}

/**
 * POST /api/kvk-map/detect-nodes
 * Accepts a single tile + annotations, returns detected nodes for that tile.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI detection not configured. Set ANTHROPIC_API_KEY in .env.local.' },
      { status: 503 },
    );
  }

  let body: {
    tile: { base64: string; gridX: number; gridY: number };
    annotations: AnnotationInput[];
    tilePixelSize: number;
    scaledSize: number;
    mapSize: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { tile, annotations, tilePixelSize, scaledSize, mapSize } = body;

  if (!tile?.base64 || !tilePixelSize || !scaledSize || !mapSize) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Filter annotations to those within this tile (convert game coords → tile-relative pixel coords)
  const tileAnnotations: AnnotationInput[] = annotations
    .map((ann) => {
      const pixelX = (ann.x / mapSize) * scaledSize;
      const pixelY = (ann.y / mapSize) * scaledSize;
      const relX = pixelX - tile.gridX * tilePixelSize;
      const relY = pixelY - tile.gridY * tilePixelSize;
      return { x: Math.round(relX), y: Math.round(relY), type: ann.type };
    })
    .filter(
      (ann) =>
        ann.x >= -20 &&
        ann.x <= tilePixelSize + 20 &&
        ann.y >= -20 &&
        ann.y <= tilePixelSize + 20,
    );

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: tile.base64,
                },
              },
              {
                type: 'text',
                text: buildTilePrompt(tilePixelSize, tileAnnotations),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const msg = errorData?.error?.message || `HTTP ${response.status}`;
      console.error(`Claude API error for tile (${tile.gridX},${tile.gridY}):`, msg);
      return NextResponse.json({ error: `Claude API error: ${msg}` }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '[]';

    // Extract JSON array from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ nodes: [], gridX: tile.gridX, gridY: tile.gridY });
    }

    let pixelNodes: DetectedNode[] = [];
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        pixelNodes = parsed
          .filter(
            (n: Record<string, unknown>) =>
              typeof n.x === 'number' &&
              typeof n.y === 'number' &&
              typeof n.type === 'string' &&
              ['food', 'wood', 'stone', 'gold', 'crystal'].includes(n.type as string) &&
              (typeof n.confidence !== 'number' || n.confidence >= 0.5),
          )
          .map((n: Record<string, unknown>) => ({
            x: Math.round(n.x as number),
            y: Math.round(n.y as number),
            type: n.type as string,
            confidence: typeof n.confidence === 'number' ? n.confidence : 0.7,
          }));
      }
    } catch {
      // JSON parse failed — return empty
    }

    // Convert tile-relative pixel coords to game coords
    const gameNodes = pixelNodes.map((n) => {
      const pixelX = tile.gridX * tilePixelSize + n.x;
      const pixelY = tile.gridY * tilePixelSize + n.y;
      return {
        x: Math.round((pixelX / scaledSize) * mapSize),
        y: Math.round((pixelY / scaledSize) * mapSize),
        type: n.type,
        confidence: n.confidence,
      };
    });

    return NextResponse.json({
      nodes: gameNodes,
      gridX: tile.gridX,
      gridY: tile.gridY,
    });
  } catch (error) {
    console.error(`Tile (${tile.gridX},${tile.gridY}) failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Detection failed' },
      { status: 500 },
    );
  }
}
