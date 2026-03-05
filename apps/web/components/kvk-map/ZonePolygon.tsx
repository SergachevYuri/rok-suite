'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { Polygon } from 'react-leaflet';
import type L from 'leaflet';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZonePolygonProps {
  zone: KvkMapZone;
  onClick?: (zone: KvkMapZone) => void;
  isSelected?: boolean;
  isHighlighted?: boolean;
}

export default function ZonePolygon({ zone, onClick, isSelected = false, isHighlighted = false }: ZonePolygonProps) {
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
      dashArray: undefined,
    });
  }, [isSelected]);

  const interactive = !!onClick;

  const handleMouseOut = useCallback(() => {
    if (isSelected || isHighlighted) return;
    setIsHovered(false);
    if (interactive) {
      polygonRef.current?.setStyle({
        color: zone.color,
        fillOpacity: 0,
        weight: 1,
        opacity: 0.3,
        dashArray: '6 3',
      });
    } else {
      polygonRef.current?.setStyle({
        fillOpacity: 0,
        weight: 0,
        opacity: 0,
      });
    }
  }, [isSelected, isHighlighted, interactive, zone.color]);

  const showHighlight = isSelected || isHovered || isHighlighted;

  return (
    <Polygon
      ref={polygonRef}
      positions={positions}
      pathOptions={{
        color: showHighlight ? '#ffffff' : interactive ? zone.color : 'transparent',
        fillColor: showHighlight ? '#ffffff' : 'transparent',
        fillOpacity: isSelected ? 0.18 : showHighlight ? 0.12 : 0,
        weight: isSelected ? 2 : showHighlight ? 1 : interactive ? 1 : 0,
        opacity: isSelected ? 0.5 : showHighlight ? 0.3 : interactive ? 0.3 : 0,
        dashArray: showHighlight || !interactive ? undefined : '6 3',
      }}
      interactive={interactive}
      eventHandlers={{
        ...(onClick ? { click: () => onClick?.(zone) } : {}),
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      }}
    />
  );
}
