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
  /** When set, zones NOT matching this number get a semi-opaque mask. */
  activeZoneNumber?: number | null;
}

export default function ZonePolygon({ zone, onClick, isSelected = false, isHighlighted = false, activeZoneNumber }: ZonePolygonProps) {
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

  const hasKingdomFill = !!zone.kingdom;

  const handleMouseOut = useCallback(() => {
    if (isSelected || isHighlighted) return;
    setIsHovered(false);
    if (interactive) {
      polygonRef.current?.setStyle({
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: hasKingdomFill ? 0.08 : 0,
        weight: 1,
        opacity: 0.3,
        dashArray: hasKingdomFill ? undefined : '6 3',
      });
    } else if (hasKingdomFill) {
      polygonRef.current?.setStyle({
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.08,
        weight: 1,
        opacity: 0.3,
      });
    } else {
      polygonRef.current?.setStyle({
        fillOpacity: 0,
        weight: 0,
        opacity: 0,
      });
    }
  }, [isSelected, isHighlighted, interactive, zone.color, hasKingdomFill]);

  const showHighlight = isSelected || isHovered || isHighlighted;
  const isDimmed = activeZoneNumber != null && zone.zone_number !== activeZoneNumber;

  // Zones with kingdoms get a subtle tinted fill even when not interactive
  const baseColor = showHighlight ? '#ffffff' : isDimmed ? '#ffffff' : interactive || hasKingdomFill ? zone.color : 'transparent';
  const baseFill = showHighlight ? '#ffffff' : isDimmed ? '#ffffff' : hasKingdomFill ? zone.color : 'transparent';
  const baseFillOpacity = isSelected ? 0.18 : showHighlight ? 0.12 : isDimmed ? 0.35 : hasKingdomFill ? 0.08 : 0;
  const baseWeight = isSelected ? 2 : showHighlight ? 1 : isDimmed ? 0 : interactive || hasKingdomFill ? 1 : 0;
  const baseOpacity = isSelected ? 0.5 : showHighlight ? 0.3 : isDimmed ? 0 : interactive || hasKingdomFill ? 0.3 : 0;

  return (
    <Polygon
      ref={polygonRef}
      positions={positions}
      pathOptions={{
        color: baseColor,
        fillColor: baseFill,
        fillOpacity: baseFillOpacity,
        weight: baseWeight,
        opacity: baseOpacity,
        dashArray: showHighlight || isDimmed || hasKingdomFill || !interactive ? undefined : '6 3',
      }}
      interactive={(interactive || hasKingdomFill) && !isDimmed}
      eventHandlers={{
        ...(onClick && !isDimmed ? { click: () => onClick?.(zone) } : {}),
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      }}
    />
  );
}
