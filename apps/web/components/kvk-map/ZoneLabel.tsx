'use client';

import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZoneLabelProps {
  zone: KvkMapZone;
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

export default function ZoneLabel({ zone }: ZoneLabelProps) {
  const [cx, cy] = useMemo(() => computeCentroid(zone.polygon), [zone.polygon]);

  const icon = useMemo(() => {
    const label = zone.name || `Zone ${zone.zone_number}`;
    return new L.DivIcon({
      className: '',
      iconAnchor: [0, 0],
      html: `<div style="
        transform: translate(-50%, -50%);
        white-space: nowrap;
        font-size: 11px;
        font-weight: 600;
        color: ${zone.color};
        text-shadow: 0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5);
        pointer-events: none;
        user-select: none;
      ">${label}</div>`,
    });
  }, [zone.name, zone.zone_number, zone.color]);

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
