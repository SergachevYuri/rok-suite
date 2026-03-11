'use client';

import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZoneLabelProps {
  zone: KvkMapZone;
  zoom?: number;
  flagCount?: number;
}

/** Use bounding-box center — works for both simple rectangles and complex polygons */
function computeCenter(polygon: [number, number][]): [number, number] {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

// Large fixed container — Leaflet handles centering via iconAnchor margin offset.
// text-align: center is the most reliable way to center text inside a known-width block.
const ICON_W = 500;
const ICON_H = 100;

export default function ZoneLabel({ zone, zoom = -1, flagCount = 0 }: ZoneLabelProps) {
  const [cx, cy] = useMemo(() => computeCenter(zone.polygon), [zone.polygon]);

  // Scale: 9px at zoom -2, 11px at -1, 13 at 0, 15 at 1, 17 at 2
  const fontSize = 9 + (zoom + 2) * 2;

  const icon = useMemo(() => {
    const label = zone.name || `Zone ${zone.zone_number}`;
    const kingdomLine = zone.kingdom
      ? `<div style="font-size: ${Math.max(fontSize - 3, 7)}px; font-weight: 700; color: rgba(255,200,50,0.9); margin-top: 1px;">K${zone.kingdom}</div>`
      : '';
    const flagLine = flagCount > 0
      ? `<div style="font-size: ${Math.max(fontSize - 3, 7)}px; font-weight: 600; color: rgba(180,220,255,0.85); margin-top: 1px;">⚑ ${flagCount} flag${flagCount !== 1 ? 's' : ''}</div>`
      : '';
    return new L.DivIcon({
      className: '',
      iconSize: [ICON_W, ICON_H],
      iconAnchor: [ICON_W / 2, ICON_H / 2],
      html: `<div style="
        width: ${ICON_W}px;
        height: ${ICON_H}px;
        line-height: ${ICON_H}px;
        text-align: center;
        pointer-events: none;
        user-select: none;
      "><div style="
        display: inline-block;
        vertical-align: middle;
        line-height: 1.3;
        white-space: nowrap;
        text-align: center;
        font-size: ${fontSize}px;
        font-weight: 600;
        color: rgba(255,255,255,0.85);
        text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
      ">${label}${kingdomLine}${flagLine}</div></div>`,
    });
  }, [zone.name, zone.zone_number, zone.kingdom, fontSize, flagCount]);

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
