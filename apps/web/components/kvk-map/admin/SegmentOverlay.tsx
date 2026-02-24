'use client';

import { useMemo } from 'react';
import { Polyline, Polygon } from 'react-leaflet';
import type { SymmetryConfig } from '@/lib/kvk-map/rss-symmetry';
import { getSegmentBoundaryLines, getSegmentWedge } from '@/lib/kvk-map/rss-symmetry';

interface SegmentOverlayProps {
  config: SymmetryConfig;
  mapSize: number;
  sourceSegment: number;
  visible: boolean;
}

export default function SegmentOverlay({ config, mapSize, sourceSegment, visible }: SegmentOverlayProps) {
  const boundaryLines = useMemo(() => getSegmentBoundaryLines(config, mapSize), [config, mapSize]);
  const wedge = useMemo(() => getSegmentWedge(sourceSegment, config, mapSize), [sourceSegment, config, mapSize]);

  if (!visible) return null;

  // Convert game [x, y] to Leaflet [y, x]
  const wedgePositions = wedge.map(([x, y]) => [y, x] as [number, number]);

  return (
    <>
      {/* Source segment highlight */}
      <Polygon
        positions={wedgePositions}
        pathOptions={{
          color: 'rgba(59, 130, 246, 0.4)',
          fillColor: 'rgba(59, 130, 246, 0.08)',
          fillOpacity: 1,
          weight: 0,
        }}
      />

      {/* Segment boundary lines */}
      {boundaryLines.map(([start, end], i) => (
        <Polyline
          key={i}
          positions={[
            [start[1], start[0]] as [number, number],
            [end[1], end[0]] as [number, number],
          ]}
          pathOptions={{
            color: 'rgba(255, 255, 255, 0.15)',
            weight: 1,
            dashArray: '6, 4',
          }}
        />
      ))}
    </>
  );
}
