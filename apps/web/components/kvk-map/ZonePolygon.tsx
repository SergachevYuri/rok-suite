'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
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
  const [isHovered, setIsHovered] = useState(false);

  // Convert stored [x, y] pairs to Leaflet [lat, lng] = [y, x]
  const positions = useMemo<L.LatLngExpression[]>(
    () => zone.polygon.map(([x, y]) => [y, x] as [number, number]),
    [zone.polygon]
  );

  const handleMouseOver = useCallback(() => {
    if (isSelected) return;
    setIsHovered(true);
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
    setIsHovered(false);
    polygonRef.current?.setStyle({
      fillOpacity: 0,
      weight: 0,
      opacity: 0,
    });
  }, [isSelected]);

  const highlighted = isSelected || isHovered;

  return (
    <Polygon
      ref={polygonRef}
      positions={positions}
      pathOptions={{
        color: highlighted ? '#ffffff' : 'transparent',
        fillColor: highlighted ? '#ffffff' : 'transparent',
        fillOpacity: isSelected ? 0.18 : isHovered ? 0.12 : 0,
        weight: isSelected ? 2 : isHovered ? 1 : 0,
        opacity: isSelected ? 0.5 : isHovered ? 0.3 : 0,
      }}
      interactive={!!onClick}
      eventHandlers={{
        ...(onClick ? { click: () => onClick?.(zone) } : {}),
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      }}
    />
  );
}
