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

/**
 * Estimate the pixel width of a text string at a given font size and weight.
 * Uses approximate average character widths for sans-serif at weight 600.
 */
function estimateTextWidth(text: string, size: number): number {
  // At 600 weight, average char width is ~0.62 * fontSize for sans-serif
  return text.length * size * 0.62;
}

export default function ZoneLabel({ zone, zoom = -1 }: ZoneLabelProps) {
  const [cx, cy] = useMemo(() => computeCentroid(zone.polygon), [zone.polygon]);

  // Scale: 9px at zoom -2, 11px at -1, 13 at 0, 15 at 1, 17 at 2
  const fontSize = 9 + (zoom + 2) * 2;

  const icon = useMemo(() => {
    const label = zone.name || `Zone ${zone.zone_number}`;
    const hasKingdom = !!zone.kingdom;
    const kingdomLine = hasKingdom
      ? `<div style="font-size: ${Math.max(fontSize - 3, 7)}px; font-weight: 700; color: rgba(255,200,50,0.9); margin-top: 1px;">K${zone.kingdom}</div>`
      : '';

    // Estimate dimensions for iconAnchor centering
    const nameWidth = estimateTextWidth(label, fontSize);
    const kingdomWidth = hasKingdom ? estimateTextWidth(`K${zone.kingdom}`, Math.max(fontSize - 3, 7)) : 0;
    const estWidth = Math.max(nameWidth, kingdomWidth) + 4; // small padding
    const lineHeight = fontSize * 1.3;
    const estHeight = hasKingdom ? lineHeight * 2 + 2 : lineHeight;

    return new L.DivIcon({
      className: '',
      iconSize: [estWidth, estHeight],
      iconAnchor: [estWidth / 2, estHeight / 2],
      html: `<div style="
        width: ${estWidth}px;
        height: ${estHeight}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        text-align: center;
        font-size: ${fontSize}px;
        font-weight: 600;
        color: rgba(255,255,255,0.85);
        text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
        pointer-events: none;
        user-select: none;
      ">${label}${kingdomLine}</div>`,
    });
  }, [zone.name, zone.zone_number, zone.kingdom, fontSize]);

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
