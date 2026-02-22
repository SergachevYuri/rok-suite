'use client';

import { useMemo } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';
import type L from 'leaflet';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZonePolygonProps {
  zone: KvkMapZone;
  onClick?: (zone: KvkMapZone) => void;
  isSelected?: boolean;
}

export default function ZonePolygon({ zone, onClick, isSelected = false }: ZonePolygonProps) {
  // Convert stored [x, y] pairs to Leaflet [lat, lng] = [y, x]
  const positions = useMemo<L.LatLngExpression[]>(
    () => zone.polygon.map(([x, y]) => [y, x] as [number, number]),
    [zone.polygon]
  );

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: zone.opacity,
        weight: isSelected ? 3 : 1,
        opacity: isSelected ? 0.8 : 0.4,
      }}
      interactive={!!onClick}
      eventHandlers={onClick ? { click: () => onClick(zone) } : undefined}
    >
      <Tooltip direction="center" permanent={false} opacity={0.9}>
        <div style={{ fontSize: '11px' }}>
          <strong>{zone.name || `Zone ${zone.zone_number}`}</strong>
          <div style={{ color: '#6b7280', fontSize: '10px' }}>Zone {zone.zone_number}</div>
        </div>
      </Tooltip>
    </Polygon>
  );
}
