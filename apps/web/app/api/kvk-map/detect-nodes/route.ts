import { NextRequest, NextResponse } from 'next/server';

interface TileInput {
  base64: string;
  gridX: number;
  gridY: number;
}

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

interface TileResult {
  gridX: number;
  gridY: number;
  nodes: DetectedNode[];
}

const SYSTEM_PROMPT = `You are a computer vision specialist analyzing sections of a Rise of Kingdoms KvK (Kingdom vs Kingdom) map. Your task is to identify resource nodes (RSS nodes) in the image.

Resource nodes are small colored dots/circles scattered across the map. Each type has a distinct color:
- food: bright green circles
- wood: brownish/dark yellow circles
- stone: gray circles
- gold: bright yellow/golden circles
- crystal: purple/violet circles

These nodes are small (roughly 3-8 pixels in the original image) and scattered throughout the map terrain. They are NOT buildings, cities, or large structures — they are small resource gathering points.

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
    prompt += `\n\nHere are some example nodes the user has already identified in this tile region (pixel coordinates within this tile):`;
    for (const ann of annotations) {
      prompt += `\n- ${ann.type} node at (${ann.x}, ${ann.y})`;
    }
    prompt += `\nUse these as reference for what the nodes look like. Find additional nodes similar to these.`;
  }

  prompt += `\n\nRespond with ONLY a JSON array like: [{"x": 100, "y": 200, "type": "food", "confidence": 0.8}]
If no nodes are found, respond with: []`;

  return prompt;
}

async function detectNodesInTile(
  apiKey: string,
  tile: TileInput,
  annotations: AnnotationInput[],
  tilePixelSize: number,
): Promise<DetectedNode[]> {
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
              text: buildTilePrompt(tilePixelSize, annotations),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Claude API error: ${msg}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';

  // Extract JSON array from response (handle potential markdown wrapping)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (n: Record<string, unknown>) =>
          typeof n.x === 'number' &&
          typeof n.y === 'number' &&
          typeof n.type === 'string' &&
          ['food', 'wood', 'stone', 'gold', 'crystal'].includes(n.type) &&
          (typeof n.confidence !== 'number' || n.confidence >= 0.5),
      )
      .map((n: Record<string, unknown>) => ({
        x: Math.round(n.x as number),
        y: Math.round(n.y as number),
        type: n.type as string,
        confidence: typeof n.confidence === 'number' ? n.confidence : 0.7,
      }));
  } catch {
    return [];
  }
}

/**
 * Deduplicate nodes that are very close together (within `radius` pixels).
 * Keeps the one with higher confidence.
 */
function deduplicateNodes(nodes: DetectedNode[], radius: number = 15): DetectedNode[] {
  const result: DetectedNode[] = [];
  for (const node of nodes) {
    const duplicate = result.find(
      (existing) =>
        existing.type === node.type &&
        Math.hypot(existing.x - node.x, existing.y - node.y) < radius,
    );
    if (duplicate) {
      // Keep higher confidence
      if (node.confidence > duplicate.confidence) {
        Object.assign(duplicate, node);
      }
    } else {
      result.push({ ...node });
    }
  }
  return result;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI detection not configured. Set ANTHROPIC_API_KEY in .env.local.' },
      { status: 503 },
    );
  }

  let body: {
    tiles: TileInput[];
    annotations: AnnotationInput[];
    tilePixelSize: number;
    imageSize: number;
    mapSize: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { tiles, annotations, tilePixelSize, imageSize, mapSize } = body;

  if (!tiles?.length || !tilePixelSize || !imageSize || !mapSize) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const gridSize = Math.round(imageSize / tilePixelSize);
  const results: TileResult[] = [];

  // Process tiles sequentially to avoid rate limits
  for (const tile of tiles) {
    // Filter annotations to those within this tile (in pixel space)
    const tileAnnotations: AnnotationInput[] = annotations
      .map((ann) => {
        // Convert game coords to pixel coords
        const pixelX = (ann.x / mapSize) * imageSize;
        const pixelY = (ann.y / mapSize) * imageSize;
        // Convert to tile-relative coords
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
      const detectedPixelNodes = await detectNodesInTile(
        apiKey,
        tile,
        tileAnnotations,
        tilePixelSize,
      );

      // Convert tile-relative pixel coords to game coords
      const gameNodes = detectedPixelNodes.map((n) => {
        const pixelX = tile.gridX * tilePixelSize + n.x;
        const pixelY = tile.gridY * tilePixelSize + n.y;
        return {
          x: Math.round((pixelX / imageSize) * mapSize),
          y: Math.round((pixelY / imageSize) * mapSize),
          type: n.type,
          confidence: n.confidence,
        };
      });

      results.push({ gridX: tile.gridX, gridY: tile.gridY, nodes: gameNodes });
    } catch (error) {
      console.error(`Tile (${tile.gridX},${tile.gridY}) failed:`, error);
      results.push({ gridX: tile.gridX, gridY: tile.gridY, nodes: [] });
    }
  }

  // Merge all nodes and deduplicate near tile edges
  const allNodes = results.flatMap((r) => r.nodes);
  // Deduplicate in game coordinate space (radius ~5 game units)
  const deduplicated = deduplicateNodes(allNodes, 5);

  return NextResponse.json({
    nodes: deduplicated,
    tileResults: results.map((r) => ({
      gridX: r.gridX,
      gridY: r.gridY,
      count: r.nodes.length,
    })),
    total: deduplicated.length,
  });
}
