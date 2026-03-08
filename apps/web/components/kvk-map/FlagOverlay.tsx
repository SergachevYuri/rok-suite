'use client';

import { useMemo } from 'react';
import { Rectangle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapFeature, AssignmentStatus } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';

interface FlagOverlayProps {
  feature: KvkMapFeature;
  isSelected?: boolean;
  isDraggable?: boolean;
  dimmed?: boolean;
  zoom?: number;
  allianceColor?: string | null;
  allianceTag?: string | null;
  assignmentStatus?: AssignmentStatus | null;
  onClick?: (feature: KvkMapFeature) => void;
  onDragEnd?: (feature: KvkMapFeature, newX: number, newY: number) => void;
  onMouseOver?: (feature: KvkMapFeature) => void;
  onMouseOut?: (feature: KvkMapFeature) => void;
}

export default function FlagOverlay({
  feature,
  isSelected = false,
  isDraggable = false,
  dimmed = false,
  zoom = -1,
  allianceColor,
  allianceTag,
  assignmentStatus,
  onClick,
  onDragEnd,
  onMouseOver,
  onMouseOut,
}: FlagOverlayProps) {
  const config = FEATURE_TYPE_CONFIG[feature.feature_type];
  const tileSize = config?.tileSize ?? 9;
  const half = tileSize / 2;

  const color = allianceColor || config?.color || '#64748b';
  const dimScale = dimmed ? 0.2 : 1;
  const statusOpacity = (assignmentStatus === 'lost' ? 0.25 : 0.7) * dimScale;

  // At low zoom, show only thin outlines; at higher zoom, show labels
  const showLabel = zoom >= 1;

  // Rectangle bounds: [southWest, northEast] = [[y-half, x-half], [y+half, x+half]]
  const rectBounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [feature.y - half, feature.x - half],
      [feature.y + half, feature.x + half],
    ],
    [feature.x, feature.y, half]
  );

  // Center marker position: [y, x] in CRS.Simple
  const position = useMemo<L.LatLngExpression>(
    () => [feature.y, feature.x],
    [feature.x, feature.y]
  );

  // Small center icon for click/drag — only visible when zoomed in
  const icon = useMemo(() => {
    if (!showLabel) {
      // Invisible 1px icon just for click target
      return new L.DivIcon({
        className: '',
        iconSize: [1, 1],
        iconAnchor: [0, 0],
        html: `<div style="width:1px;height:1px;cursor:pointer;"></div>`,
      });
    }
    const size = 12 + (zoom + 2) * 1.5;
    const label = allianceTag || config?.abbreviation || 'FL';
    return new L.DivIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 2px;
        background: rgba(0,0,0,0.45);
        border: 0.5px solid ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${Math.max(7, Math.round(size * 0.5))}px;
        font-weight: 600;
        color: ${color};
        cursor: pointer;
        opacity: ${dimScale * 0.85};
      ">${label}</div>`,
    });
  }, [zoom, showLabel, color, allianceTag, config?.abbreviation, dimScale]);

  // Zoom-dependent rectangle style: subtle outlines when zoomed out, more visible when zoomed in
  const rectWeight = showLabel ? (isSelected ? 1.5 : 0.5) : (isSelected ? 1 : 0.3);
  const rectFillOpacity = showLabel
    ? (isSelected ? 0.2 : 0.08) * statusOpacity
    : (isSelected ? 0.1 : 0.03) * statusOpacity;

  return (
    <>
      <Rectangle
        bounds={rectBounds}
        pathOptions={{
          color,
          weight: rectWeight,
          opacity: statusOpacity,
          fillColor: color,
          fillOpacity: rectFillOpacity,
          dashArray: isSelected ? undefined : showLabel ? '4 3' : '2 2',
        }}
        eventHandlers={{
          click: () => onClick?.(feature),
        }}
      />
      <Marker
        position={position}
        icon={icon}
        draggable={isDraggable}
        eventHandlers={{
          click: () => onClick?.(feature),
          mouseover: () => onMouseOver?.(feature),
          mouseout: () => onMouseOut?.(feature),
          dragend: (e) => {
            const pos = e.target.getLatLng();
            onDragEnd?.(feature, pos.lng, pos.lat);
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -10]} opacity={0.92}>
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            <strong>{config?.label}</strong>
            <span style={{ color: '#9ca3af' }}> {tileSize}×{tileSize}</span>
            {allianceTag && (
              <span style={{ color: allianceColor || '#9ca3af', fontWeight: 600 }}> [{allianceTag}]</span>
            )}
          </div>
        </Tooltip>
      </Marker>
    </>
  );
}
