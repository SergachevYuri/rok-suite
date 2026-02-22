'use client';

import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZoneLabelProps {
  zone: KvkMapZone;
  zoom?: number;
}

function computeCentroid(polygon: [number, number][]): [number, number] {
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of polygon) {
    sumX += x;
    sumY += y;
  }
  return [sumX / polygon.length, sumY / polygon.length];
}

export default function ZoneLabel({ zone, zoom = -1 }: ZoneLabelProps) {
  const [cx, cy] = useMemo(() => computeCentroid(zone.polygon), [zone.polygon]);

  // Scale: 9px at zoom -2, 11px at -1, 13 at 0, 15 at 1, 17 at 2
  const fontSize = 9 + (zoom + 2) * 2;

  const icon = useMemo(() => {
    const label = zone.name || `Zone ${zone.zone_number}`;
    return new L.DivIcon({
      className: '',
      iconAnchor: [0, 0],
      html: `<div style="
        transform: translate(-50%, -50%);
        white-space: nowrap;
        font-size: ${fontSize}px;
        font-weight: 600;
        color: rgba(255,255,255,0.85);
        text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
        pointer-events: none;
        user-select: none;
      ">${label}</div>`,
    });
  }, [zone.name, zone.zone_number, fontSize]);

  // Leaflet CRS.Simple: [lat, lng] = [y, x]
  const position: L.LatLngExpression = [cy, cx];

  return (
    <Marker
      position={position}
      icon={icon}
      interactive={false}
    />
  );
}
