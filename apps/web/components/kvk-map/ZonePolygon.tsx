'use client';

import { useMemo, useRef, useCallback } from 'react';
import { Polygon } from 'react-leaflet';
import type L from 'leaflet';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZonePolygonProps {
  zone: KvkMapZone;
  onClick?: (zone: KvkMapZone) => void;
  isSelected?: boolean;
}

export default function ZonePolygon({ zone, onClick, isSelected = false }: ZonePolygonProps) {
  const polygonRef = useRef<L.Polygon | null>(null);

  // Convert stored [x, y] pairs to Leaflet [lat, lng] = [y, x]
  const positions = useMemo<L.LatLngExpression[]>(
    () => zone.polygon.map(([x, y]) => [y, x] as [number, number]),
    [zone.polygon]
  );

  const handleMouseOver = useCallback(() => {
    if (isSelected) return;
    polygonRef.current?.setStyle({
      fillColor: '#ffffff',
      fillOpacity: 0.12,
      color: '#ffffff',
      weight: 1,
      opacity: 0.3,
    });
  }, [isSelected]);

  const handleMouseOut = useCallback(() => {
    if (isSelected) return;
    polygonRef.current?.setStyle({
      fillOpacity: 0,
      weight: 0,
      opacity: 0,
    });
  }, [isSelected]);

  return (
    <Polygon
      ref={polygonRef}
      positions={positions}
      pathOptions={{
        color: isSelected ? '#ffffff' : 'transparent',
        fillColor: isSelected ? '#ffffff' : 'transparent',
        fillOpacity: isSelected ? 0.18 : 0,
        weight: isSelected ? 2 : 0,
        opacity: isSelected ? 0.5 : 0,
      }}
      interactive={!!onClick}
      eventHandlers={{
        ...(onClick ? { click: () => onClick(zone) } : {}),
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      }}
    />
  );
}
