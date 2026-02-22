'use client';

import { useMemo } from 'react';
import { Polyline, CircleMarker } from 'react-leaflet';
import type L from 'leaflet';

interface DrawingOverlayProps {
  vertices: [number, number][]; // [x, y] pairs
  currentPoint?: { x: number; y: number } | null;
}

export default function DrawingOverlay({ vertices, currentPoint }: DrawingOverlayProps) {
  // Convert [x, y] to Leaflet [lat, lng] = [y, x]
  const positions = useMemo<L.LatLngExpression[]>(
    () => vertices.map(([x, y]) => [y, x] as [number, number]),
    [vertices]
  );

  // Preview line from placed vertices through cursor
  const previewPositions = useMemo<L.LatLngExpression[] | null>(() => {
    if (vertices.length > 0 && currentPoint) {
      return [...positions, [currentPoint.y, currentPoint.x] as [number, number]];
    }
    return null;
  }, [positions, vertices.length, currentPoint]);

  // Closing line from cursor back to first vertex (when 3+ placed)
  const closingLine = useMemo<L.LatLngExpression[] | null>(() => {
    if (vertices.length >= 3 && currentPoint) {
      return [
        [currentPoint.y, currentPoint.x] as [number, number],
        positions[0],
      ];
    }
    return null;
  }, [vertices.length, currentPoint, positions]);

  if (vertices.length === 0) return null;

  return (
    <>
      {/* Vertex dots */}
      {positions.map((pos, i) => (
        <CircleMarker
          key={i}
          center={pos}
          radius={5}
          pathOptions={{
            color: '#3b82f6',
            fillColor: i === 0 ? '#34d399' : '#60a5fa',
            fillOpacity: 1,
            weight: 2,
          }}
        />
      ))}

      {/* Placed edges */}
      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.8 }}
        />
      )}

      {/* Dashed preview line to cursor */}
      {previewPositions && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#60a5fa', weight: 2, opacity: 0.5, dashArray: '5, 5' }}
        />
      )}

      {/* Dashed closing line (cursor → first vertex) */}
      {closingLine && (
        <Polyline
          positions={closingLine}
          pathOptions={{ color: '#34d399', weight: 2, opacity: 0.5, dashArray: '5, 5' }}
        />
      )}
    </>
  );
}
