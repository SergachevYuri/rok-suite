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
  /** When set, zones NOT in this list get a semi-opaque mask. */
  activeZoneNumbers?: number[] | null;
  /** Suppress hover highlighting (e.g. during annotation drawing) */
  disableHover?: boolean;
}

export default function ZonePolygon({ zone, onClick, isSelected = false, isHighlighted = false, activeZoneNumbers, disableHover = false }: ZonePolygonProps) {
  const polygonRef = useRef<L.Polygon | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Convert stored [x, y] pairs to Leaflet [lat, lng] = [y, x]
  const positions = useMemo<L.LatLngExpression[]>(
    () => zone.polygon.map(([x, y]) => [y, x] as [number, number]),
    [zone.polygon]
  );

  const handleMouseOver = useCallback(() => {
    if (isSelected || disableHover) return;
    setIsHovered(true);
    polygonRef.current?.setStyle({
      fillColor: '#ffffff',
      fillOpacity: 0.12,
      color: '#ffffff',
      weight: 1,
      opacity: 0.3,
      dashArray: undefined,
    });
  }, [isSelected, disableHover]);

  const hasClick = !!onClick;

  const hasKingdomFill = !!zone.kingdom;

  const handleMouseOut = useCallback(() => {
    if (isSelected || isHighlighted) return;
    setIsHovered(false);
    if (hasClick) {
      polygonRef.current?.setStyle({
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: hasKingdomFill ? 0.15 : 0,
        weight: hasKingdomFill ? 1.5 : 1,
        opacity: hasKingdomFill ? 0.5 : 0.3,
        dashArray: hasKingdomFill ? undefined : '6 3',
      });
    } else if (hasKingdomFill) {
      polygonRef.current?.setStyle({
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.15,
        weight: 1.5,
        opacity: 0.5,
      });
    } else {
      polygonRef.current?.setStyle({
        fillOpacity: 0,
        weight: 0,
        opacity: 0,
      });
    }
  }, [isSelected, isHighlighted, hasClick, zone.color, hasKingdomFill]);

  const showHighlight = isSelected || isHovered || isHighlighted;
  const isDimmed = activeZoneNumbers != null && !activeZoneNumbers.includes(zone.zone_number);

  // When disableHover is true (e.g. war plan annotation mode), make zones
  // fully non-interactive so clicks pass through to the map layer beneath.
  const isInteractive = !disableHover && (hasClick || hasKingdomFill) && !isDimmed;

  // Zones with kingdoms get a subtle tinted fill even when not interactive
  const baseColor = showHighlight ? '#ffffff' : isDimmed ? '#ffffff' : hasClick || hasKingdomFill ? zone.color : 'transparent';
  const baseFill = showHighlight ? '#ffffff' : isDimmed ? '#ffffff' : hasKingdomFill ? zone.color : 'transparent';
  const baseFillOpacity = isSelected ? 0.22 : showHighlight ? 0.15 : isDimmed ? 0.35 : hasKingdomFill ? 0.15 : 0;
  const baseWeight = isSelected ? 2 : showHighlight ? 1.5 : isDimmed ? 0 : hasKingdomFill ? 1.5 : hasClick ? 1 : 0;
  const baseOpacity = isSelected ? 0.6 : showHighlight ? 0.4 : isDimmed ? 0 : hasKingdomFill ? 0.5 : hasClick ? 0.3 : 0;

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
        dashArray: showHighlight || isDimmed || hasKingdomFill || !hasClick ? undefined : '6 3',
      }}
      interactive={isInteractive}
      eventHandlers={isInteractive ? {
        ...(onClick && !isDimmed ? { click: () => onClick?.(zone) } : {}),
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      } : {}}
    />
  );
}
